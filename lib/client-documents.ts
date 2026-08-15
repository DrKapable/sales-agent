import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export const MAX_CLIENT_DOCUMENT_BYTES = 4 * 1024 * 1024;

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
};

export type ClientDocumentRecord = ClientDocumentSummary & { bytes: Uint8Array };

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
      last_sent_at TIMESTAMPTZ
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS client_documents_lead_created_idx ON client_documents(lead_id, created_at DESC)`);
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
    lastSentAt: row.last_sent_at ? new Date(String(row.last_sent_at)).toISOString() : null
  };
}

export function sanitizeDocumentFilename(value: string) {
  const leaf = value.replaceAll("\\", "/").split("/").pop() || "document";
  return leaf.replace(/[^a-zA-Z0-9._()\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "document";
}

export function resolveClientDocumentMime(fileName: string, suppliedMime: string | null | undefined) {
  const extension = fileName.toLowerCase().split(".").pop() || "";
  const extensionMime = MIME_BY_EXTENSION[extension];
  const normalized = suppliedMime?.split(";")[0]?.trim().toLowerCase() || "";
  if (!extensionMime || (normalized && normalized !== "application/octet-stream" && normalized !== extensionMime)) return null;
  return ALLOWED_MIME_TYPES.has(extensionMime) ? extensionMime : null;
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
    uploadedBy: input.uploadedBy || null,
    createdAt: now,
    lastSentAt: null
  };
  const db = database();
  if (!db) {
    memory.set(id, record);
    const { bytes: _bytes, ...summary } = record;
    return summary;
  }
  const encoded = Buffer.from(input.bytes).toString("base64");
  const rows = await db.query(
    `INSERT INTO client_documents (id,lead_id,phone,file_name,title,mime_type,size_bytes,data,uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,decode($8,'base64'),$9)
     RETURNING id,lead_id,phone,file_name,title,mime_type,size_bytes,uploaded_by,created_at,last_sent_at`,
    [id, input.leadId, input.phone, record.fileName, record.title, input.mimeType, input.bytes.byteLength, encoded, input.uploadedBy || null]
  );
  return mapSummary(rows[0] as Record<string, unknown>);
}

export async function listClientDocuments(leadId: string): Promise<ClientDocumentSummary[]> {
  await ensureTable();
  const db = database();
  if (!db) return [...memory.values()].filter((item) => item.leadId === leadId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ bytes: _bytes, ...summary }) => summary);
  const rows = await db.query(
    `SELECT id,lead_id,phone,file_name,title,mime_type,size_bytes,uploaded_by,created_at,last_sent_at
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
    `SELECT id,lead_id,phone,file_name,title,mime_type,size_bytes,uploaded_by,created_at,last_sent_at,encode(data,'base64') AS data_b64
     FROM client_documents WHERE id=$1 AND lead_id=$2 LIMIT 1`,
    [documentId, leadId]
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...mapSummary(row), bytes: new Uint8Array(Buffer.from(String(row.data_b64), "base64")) };
}

export async function markClientDocumentSent(documentId: string, leadId: string) {
  await ensureTable();
  const db = database();
  if (!db) {
    const current = memory.get(documentId);
    if (!current || current.leadId !== leadId) return false;
    memory.set(documentId, { ...current, lastSentAt: new Date().toISOString() });
    return true;
  }
  const rows = await db.query(`UPDATE client_documents SET last_sent_at=NOW() WHERE id=$1 AND lead_id=$2 RETURNING id`, [documentId, leadId]);
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
