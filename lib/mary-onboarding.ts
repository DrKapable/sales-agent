import { createHash } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import {
  monthlyEnquiryRanges,
  onboardingUseCases,
  organisationTypes
} from "./mary-onboarding-options";

export { monthlyEnquiryRanges, onboardingUseCases, organisationTypes } from "./mary-onboarding-options";

export const MAX_ONBOARDING_DOCUMENT_BYTES = 4 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png"
};

type Database = NeonQueryFunction<false, false>;

export type MaryOnboardingInput = {
  legalName: string;
  tradingName: string | null;
  organisationType: (typeof organisationTypes)[number];
  registrationNumber: string;
  tpin: string | null;
  town: string;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
  useCase: (typeof onboardingUseCases)[number];
  monthlyEnquiries: (typeof monthlyEnquiryRanges)[number];
  documentKind: "Certificate of incorporation" | "Business registration certificate";
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type MaryOnboardingSubmission = MaryOnboardingInput & {
  id: string;
  reference: string;
  createdAt: string;
};

export class MaryOnboardingUnavailableError extends Error {
  constructor() {
    super("Secure onboarding storage is not configured.");
    this.name = "MaryOnboardingUnavailableError";
  }
}

let sql: Database | null = null;
let setup: Promise<void> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureTables(db: Database) {
  setup ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS mary_onboarding_submissions (
      id UUID PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      legal_name TEXT NOT NULL,
      trading_name TEXT,
      organisation_type TEXT NOT NULL,
      registration_number TEXT NOT NULL,
      tpin TEXT,
      town TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_role TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      use_case TEXT NOT NULL,
      monthly_enquiries TEXT NOT NULL,
      consent_accepted_at TIMESTAMPTZ NOT NULL,
      notification_status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS mary_onboarding_created_idx
      ON mary_onboarding_submissions(created_at DESC)`);
    await db.query(`CREATE TABLE IF NOT EXISTS mary_onboarding_documents (
      id UUID PRIMARY KEY,
      submission_id UUID NOT NULL REFERENCES mary_onboarding_submissions(id) ON DELETE CASCADE,
      document_kind TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS mary_onboarding_document_submission_uidx
      ON mary_onboarding_documents(submission_id)`);
  })();
  await setup;
}

function extensionOf(fileName: string) {
  return fileName.toLowerCase().split(".").pop() || "";
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

export function sanitizeOnboardingFilename(value: string) {
  const leaf = value.replaceAll("\\", "/").split("/").pop() || "registration-document";
  return leaf
    .replace(/[^a-zA-Z0-9._()\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "registration-document";
}

export function resolveOnboardingDocumentMime(fileName: string, suppliedMime: string | null | undefined) {
  const expected = MIME_BY_EXTENSION[extensionOf(fileName)];
  const normalized = suppliedMime?.split(";")[0]?.trim().toLowerCase() || "";
  if (!expected) return null;
  if (normalized && normalized !== "application/octet-stream" && normalized !== expected) return null;
  return expected;
}

export function validateOnboardingDocumentBytes(fileName: string, mimeType: string, bytes: Uint8Array) {
  if (!bytes.byteLength) return { valid: false, reason: "The selected registration document is empty." } as const;
  if (bytes.byteLength > MAX_ONBOARDING_DOCUMENT_BYTES) {
    return { valid: false, reason: "The registration document must be 4 MB or smaller." } as const;
  }
  if (MIME_BY_EXTENSION[extensionOf(fileName)] !== mimeType) {
    return { valid: false, reason: "The file extension does not match the document type." } as const;
  }
  if (mimeType === "application/pdf" && !startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { valid: false, reason: "This file does not contain a valid PDF signature." } as const;
  }
  if (mimeType === "image/jpeg" && !startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return { valid: false, reason: "This file does not contain a valid JPEG signature." } as const;
  }
  if (mimeType === "image/png" && !startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { valid: false, reason: "This file does not contain a valid PNG signature." } as const;
  }
  return { valid: true, reason: null } as const;
}

function referenceFor(id: string, now: Date) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `MK-${date}-${id.replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export async function saveMaryOnboarding(input: MaryOnboardingInput): Promise<MaryOnboardingSubmission> {
  const db = database();
  if (!db) throw new MaryOnboardingUnavailableError();
  await ensureTables(db);

  const id = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const now = new Date();
  const reference = referenceFor(id, now);
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const encoded = Buffer.from(input.bytes).toString("base64");

  await db.transaction((transaction) => [
    transaction.query(
      `INSERT INTO mary_onboarding_submissions (
        id,reference,legal_name,trading_name,organisation_type,registration_number,tpin,town,
        contact_name,contact_role,contact_phone,contact_email,use_case,monthly_enquiries,consent_accepted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        reference,
        input.legalName,
        input.tradingName,
        input.organisationType,
        input.registrationNumber,
        input.tpin,
        input.town,
        input.contactName,
        input.contactRole,
        input.contactPhone,
        input.contactEmail,
        input.useCase,
        input.monthlyEnquiries,
        now.toISOString()
      ]
    ),
    transaction.query(
      `INSERT INTO mary_onboarding_documents (
        id,submission_id,document_kind,file_name,mime_type,size_bytes,checksum,data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,decode($8,'base64'))`,
      [
        documentId,
        id,
        input.documentKind,
        input.fileName,
        input.mimeType,
        input.bytes.byteLength,
        checksum,
        encoded
      ]
    )
  ]);

  return { ...input, id, reference, createdAt: now.toISOString() };
}

export async function markMaryOnboardingNotification(reference: string, status: "sent" | "partial" | "failed") {
  const db = database();
  if (!db) return;
  await db.query(
    `UPDATE mary_onboarding_submissions SET notification_status=$2 WHERE reference=$1`,
    [reference, status]
  );
}

export function buildMaryOnboardingAlert(submission: MaryOnboardingSubmission) {
  return [
    "New Mary onboarding application",
    `Reference: ${submission.reference}`,
    `Company: ${submission.legalName}`,
    `Trading name: ${submission.tradingName || "Same as legal name"}`,
    `Type: ${submission.organisationType}`,
    `Registration: ${submission.registrationNumber}`,
    `TPIN: ${submission.tpin || "Not provided"}`,
    `Location: ${submission.town}`,
    `Authorised contact: ${submission.contactName}, ${submission.contactRole}`,
    `Contact WhatsApp: +${submission.contactPhone}`,
    `Email: ${submission.contactEmail}`,
    `Primary workflow: ${submission.useCase}`,
    `Monthly enquiries: ${submission.monthlyEnquiries}`,
    `Verification file: ${submission.documentKind} (${submission.fileName})`,
    "The registration document is stored securely and attached in the next WhatsApp message."
  ].join("\n");
}

export function buildApplicantWhatsAppUrl(submission: MaryOnboardingSubmission) {
  const message = [
    "Hi Mary, I have completed the organisation onboarding form.",
    `Reference: ${submission.reference}`,
    `Company: ${submission.legalName}`,
    `Registration: ${submission.registrationNumber}`,
    `Authorised contact: ${submission.contactName}`,
    `Primary workflow: ${submission.useCase}`,
    "The required registration document was uploaded securely. Please continue the onboarding here."
  ].join("\n");
  return `https://wa.me/260762402042?text=${encodeURIComponent(message)}`;
}
