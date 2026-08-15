import { createHash } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export const MAX_CLIENT_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_CLIENT_DOCUMENTS_PER_LEAD = 20;
export const MAX_CLIENT_DOCUMENT_STORAGE_BYTES = 24 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv"
};

const ALLOWED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));
const ZIP_EXTENSIONS = new Set(["docx", "xlsx", "pptx"]);
const OLE_EXTENSIONS = new Set(["doc", "xls", "ppt"]);

export type ClientDocumentSummary = {
  id: string;
  leadId: string;
  phone: string;
  fileName: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
  lastSentAt: string | null;
  lastSentBy: string | null;
  sendCount: number;
};

export type ClientDocumentRecord = ClientDocumentSummary & { bytes: Uint8Array; checksum: string | null };
export type ClientDocumentUsage = {
  count: number;
  maxCount: number;
  totalBytes: number;
  maxTotalBytes: number;
};

export class ClientDocumentStoreError extends Error {
  constructor(
    public readonly code: "duplicate" | "count_limit" | "storage_limit",
    message: string,
    public readonly existingDocumentId: string | null = null
  ) {
    super(message);
    this.name = "ClientDocumentStoreError";
  }
}

type Database = NeonQueryFunction<false, false>;

const memory = new Map<string, ClientDocumentRecord>();
let sql: Database | null = null;
let setup: Promise<void> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureTable() {
  const db = database();
  if (!db) return;
  setup ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS client_documents (
      id UUID PRIMARY KEY,
      lead_id UUID NOT NULL,
      phone TEXT NOT NULL,
      file_name TEXT NOT NULL,
      title TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data BYTEA NOT NULL,
      uploaded_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sent_at TIMESTAMPTZ,
      checksum TEXT,
      send_count INTEGER NOT NULL DEFAULT 0,
      last_sent_by TEXT
    )`);
    await db.query(`ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS checksum TEXT`);
    await db.query(`ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS send_count INTEGER NOT NULL DEFAULT 0`);
    await db.query(`ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS last_sent_by TEXT`);
    await db.query(`CREATE INDEX IF NOT EXISTS client_documents_lead_created_idx ON client_documents(lead_id, created_at DESC)`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS client_documents_lead_checksum_uidx ON client_documents(lead_id, checksum) WHERE checksum IS NOT NULL`);
  })();
  await setup;
}

function mapSummary(row: Record<string, unknown>): ClientDocumentSummary {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    phone: String(row.phone),
    fileName: String(row.file_name),
    title: String(row.title),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    uploadedBy: row.uploaded_by ? String(row.uploaded_by) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastSentAt: row.last_sent_at ? new Date(String(row.last_sent_at)).toISOString() : null,
    lastSentBy: row.last_sent_by ? String(row.last_sent_by) : null,
    sendCount: Number(row.send_count ?? 0)
  };
}

function extensionOf(fileName: string) {
  return fileName.toLowerCase().split(".").pop() || "";
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function checksumFor(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sanitizeDocumentFilename(value: string) {
  const leaf = value.replaceAll("\\", "/").split("/").pop() || "document";
  return leaf.replace(/[^a-zA-Z0-9._()\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "document";
}

export function resolveClientDocumentMime(fileName: string, suppliedMime: string | null | undefined) {
  const extension = extensionOf(fileName);
  const extensionMime = MIME_BY_EXTENSION[extension];
  const normalized = suppliedMime?.split(";")[0]?.trim().toLowerCase() || "";
  if (!extensionMime || (normalized && normalized !== "application/octet-stream" && normalized !== extensionMime)) return null;
  return ALLOWED_MIME_TYPES.has(extensionMime) ? extensionMime : null;
}

export function validateClientDocumentBytes(fileName: string, mimeType: string, bytes: Uint8Array) {
  if (!bytes.byteLength) return { valid: false, reason: "The selected document is empty." } as const;
  const extension = extensionOf(fileName);
  if (MIME_BY_EXTENSION[extension] !== mimeType) return { valid: false, reason: "The file extension does not match the document type." } as const;

  if (extension === "pdf" && !startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { valid: false, reason: "This file does not contain a valid PDF signature." } as const;
  }
  if (ZIP_EXTENSIONS.has(extension) && !(
    startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08])
  )) {
    return { valid: false, reason: "This Office document does not contain a valid Open XML file signature." } as const;
  }
  if (OLE_EXTENSIONS.has(extension) && !startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { valid: false, reason: "This legacy Office document does not contain a valid compound-file signature." } as const;
  }
  if (extension === "txt" || extension === "csv") {
    const sample = bytes.subarray(0, Math.min(bytes.byteLength, 128 * 1024));
    if (sample.some((value) => value === 0)) return { valid: false, reason: "This file appears to contain binary data rather than plain text." } as const;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(sample);
    } catch {
      return { valid: false, reason: "TXT and CSV documents must use UTF-8 text encoding." } as const;
    }
  }
  return { valid: true, reason: null } as const;
}

export async function getClientDocumentUsage(leadId: string): Promise<ClientDocumentUsage> {
  await ensureTable();
  const db = database();
  if (!db) {
    const records = [...memory.values()].filter((item) => item.leadId === leadId);
    return {
      count: records.length,
      maxCount: MAX_CLIENT_DOCUMENTS_PER_LEAD,
      totalBytes: records.reduce((sum, item) => sum + item.sizeBytes, 0),
      maxTotalBytes: MAX_CLIENT_DOCUMENT_STORAGE_BYTES
    };
  }
  const rows = await db.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(size_bytes),0)::bigint AS total_bytes FROM client_documents WHERE lead_id=$1`, [leadId]);
  return {
    count: Number(rows[0]?.count ?? 0),
    maxCount: MAX_CLIENT_DOCUMENTS_PER_LEAD,
    totalBytes: Number(rows[0]?.total_bytes ?? 0),
    maxTotalBytes: MAX_CLIENT_DOCUMENT_STORAGE_BYTES
  };
}

export async function saveClientDocument(input: {
  leadId: string;
  phone: string;
  fileName: string;
  title?: string | null;
  mimeType: string;
  bytes: Uint8Array;
  uploadedBy?: string | null;
}): Promise<ClientDocumentSummary> {
  await ensureTable();
  const checksum = checksumFor(input.bytes);
  const usage = await getClientDocumentUsage(input.leadId);
  if (usage.count >= usage.maxCount) throw new ClientDocumentStoreError("count_limit", `This client already has the maximum of ${usage.maxCount} assigned documents.`);
  if (usage.totalBytes + input.bytes.byteLength > usage.maxTotalBytes) throw new ClientDocumentStoreError("storage_limit", "This client's assigned-document storage limit has been reached. Remove an older file before uploading another.");

  const db = database();
  if (!db) {
    const duplicate = [...memory.values()].find((item) => item.leadId === input.leadId && item.checksum === checksum);
    if (duplicate) throw new ClientDocumentStoreError("duplicate", "This exact file is already assigned to the client.", duplicate.id);
  } else {
    const duplicateRows = await db.query(`SELECT id FROM client_documents WHERE lead_id=$1 AND checksum=$2 LIMIT 1`, [input.leadId, checksum]);
    if (duplicateRows[0]?.id) throw new ClientDocumentStoreError("duplicate", "This exact file is already assigned to the client.", String(duplicateRows[0].id));
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: ClientDocumentRecord = {
    id,
    leadId: input.leadId,
    phone: input.phone,
    fileName: sanitizeDocumentFilename(input.fileName),
    title: (input.title?.trim() || sanitizeDocumentFilename(input.fileName)).slice(0, 180),
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
    bytes: input.bytes,
    checksum,
    uploadedBy: input.uploadedBy || null,
    createdAt: now,
    lastSentAt: null,
    lastSentBy: null,
    sendCount: 0
  };
  if (!db) {
    memory.set(id, record);
    const { bytes: _bytes, checksum: _checksum, ...summary } = record;
    return summary;
  }
  const encoded = Buffer.from(input.bytes).toString("base64");
  const rows = await db.query(
    `INSERT INTO client_documents (id,lead_id,phone,file_name,title,mime_type,size_bytes,data,uploaded_by,checksum)
     VALUES ($1,$2,$3,$4,$5,$6,$7,decode($8,'base64'),$9,$10)
     RETURNING id,lead_id,phone,file_name,title,mime_type,size_bytes,uploaded_by,created_at,last_sent_at,last_sent_by,send_count`,
    [id, input.leadId, input.phone, record.fileName, record.title, input.mimeType, input.bytes.byteLength, encoded, input.uploadedBy || null, checksum]
  );
  return mapSummary(rows[0] as Record<string, unknown>);
}

export async function listClientDocuments(leadId: string): Promise<ClientDocumentSummary[]> {
  await ensureTable();
  const db = database();
  if (!db) return [...memory.values()].filter((item) => item.leadId === leadId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ bytes: _bytes, checksum: _checksum, ...summary }) => summary);
  const rows = await db.query(
    `SELECT id,lead_id,phone,file_name,title,mime_type,size_bytes,uploaded_by,created_at,last_sent_at,last_sent_by,send_count
     FROM client_documents WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [leadId]
  );
  return rows.map((row) => mapSummary(row as Record<string, unknown>));
}

export async function getClientDocumentForLead(documentId: string, leadId: string): Promise<ClientDocumentRecord | null> {
  await ensureTable();
  const db = database();
  if (!db) {
    const record = memory.get(documentId);
    return record?.leadId === leadId ? record : null;
  }
  const rows = await db.query(
    `SELECT id,lead_id,phone,file_name,title,mime_type,size_bytes,uploaded_by,created_at,last_sent_at,last_sent_by,send_count,checksum,encode(data,'base64') AS data_b64
     FROM client_documents WHERE id=$1 AND lead_id=$2 LIMIT 1`,
    [documentId, leadId]
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...mapSummary(row), checksum: row.checksum ? String(row.checksum) : null, bytes: new Uint8Array(Buffer.from(String(row.data_b64), "base64")) };
}

export async function renameClientDocument(documentId: string, leadId: string, title: string): Promise<ClientDocumentSummary | null> {
  await ensureTable();
  const cleanTitle = title.trim().replace(/\s+/g, " ").slice(0, 180);
  if (!cleanTitle) return null;
  const db = database();
  if (!db) {
    const current = memory.get(documentId);
    if (!current || current.leadId !== leadId) return null;
    const updated = { ...current, title: cleanTitle };
    memory.set(documentId, updated);
    const { bytes: _bytes, checksum: _checksum, ...summary } = updated;
    return summary;
  }
  const rows = await db.query(
    `UPDATE client_documents SET title=$3 WHERE id=$1 AND lead_id=$2
     RETURNING id,lead_id,phone,file_name,title,mime_type,size_bytes,uploaded_by,created_at,last_sent_at,last_sent_by,send_count`,
    [documentId, leadId, cleanTitle]
  );
  return rows[0] ? mapSummary(rows[0] as Record<string, unknown>) : null;
}

export async function markClientDocumentSent(documentId: string, leadId: string, sentBy: string | null = null) {
  await ensureTable();
  const db = database();
  if (!db) {
    const current = memory.get(documentId);
    if (!current || current.leadId !== leadId) return false;
    memory.set(documentId, { ...current, lastSentAt: new Date().toISOString(), lastSentBy: sentBy, sendCount: current.sendCount + 1 });
    return true;
  }
  const rows = await db.query(`UPDATE client_documents SET last_sent_at=NOW(),last_sent_by=$3,send_count=send_count+1 WHERE id=$1 AND lead_id=$2 RETURNING id`, [documentId, leadId, sentBy]);
  return rows.length > 0;
}

export async function deleteClientDocument(documentId: string, leadId: string) {
  await ensureTable();
  const db = database();
  if (!db) {
    const current = memory.get(documentId);
    if (!current || current.leadId !== leadId) return false;
    memory.delete(documentId);
    return true;
  }
  const rows = await db.query(`DELETE FROM client_documents WHERE id=$1 AND lead_id=$2 RETURNING id`, [documentId, leadId]);
  return rows.length > 0;
}

export function clientDocumentChatContent(input: { title: string; fileName: string; caption?: string | null }) {
  const label = input.title && input.title !== input.fileName ? `${input.title} · ${input.fileName}` : input.fileName;
  const caption = input.caption?.trim();
  return `[DOCUMENT] ${label}${caption ? `\n${caption}` : ""}`;
}
