import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getLead } from "@/lib/store";
import { ensureFinancialColumns } from "@/lib/payment-finance";
import { buildCommercialPdf, commercialDocumentNumber, sendCommercialPdf, type CommercialRecord } from "@/lib/commercial-document";
import { buildReceiptPdf, receiptNumber, sendBrandedReceiptPdf, type VerifiedPayment } from "@/lib/receipt-delivery";
import type { ClientDocumentKind } from "@/lib/client-document-templates";
import { addMessage } from "@/lib/store";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";

let sql: NeonQueryFunction<false, false> | null = null;
function database() {
  if (!process.env.DATABASE_URL) throw new Error("Persistent database storage is required.");
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

export async function listDirectClientDocuments(phone: string) {
  const lead = await getLead(phone);
  if (!lead) return { lead: null, quotations: [], receipts: [] };
  await ensureFinancialColumns();
  const db = database();
  const [quotations, receipts] = await Promise.all([
    db.query(`SELECT * FROM sales_quotes WHERE lead_id=$1 AND status='QUOTATION' ORDER BY created_at DESC LIMIT 50`, [lead.id]),
    db.query(`SELECT * FROM client_payments WHERE lead_id=$1 AND status='VERIFIED' ORDER BY created_at DESC LIMIT 50`, [lead.id])
  ]);
  return { lead: { name: lead.name, phone: lead.phone, service: lead.serviceInterest },
    quotations: quotations.map((row) => ({ ...row, documentNumber: commercialDocumentNumber(row as unknown as CommercialRecord) })),
    receipts: receipts.map((row) => ({ ...row, documentNumber: receiptNumber(String(row.id)) })) };
}

async function loadDocument(input: { phone: string; kind: ClientDocumentKind; documentId: string }) {
  const lead = await getLead(input.phone);
  if (!lead) throw new Error("Client not found. Save the document for this number first.");
  await ensureFinancialColumns();
  const db = database();
  const rows = input.kind === "quotation"
    ? await db.query(`SELECT * FROM sales_quotes WHERE id=$1 AND lead_id=$2 AND status='QUOTATION' LIMIT 1`, [input.documentId, lead.id])
    : await db.query(`SELECT * FROM client_payments WHERE id=$1 AND lead_id=$2 AND status='VERIFIED' LIMIT 1`, [input.documentId, lead.id]);
  if (!rows[0]) throw new Error("No matching quotation or verified receipt belongs to this WhatsApp number.");
  return { lead, record: rows[0] };
}

export async function previewDirectClientDocument(input: { phone: string; kind: ClientDocumentKind; documentId: string }) {
  const { lead, record } = await loadDocument(input);
  if (input.kind === "receipt") return buildReceiptPdf({ lead, payment: record as unknown as VerifiedPayment });
  const quote = record as unknown as CommercialRecord;
  return { pdf: buildCommercialPdf(lead, quote), filename: `MedMinds-Quotation-${commercialDocumentNumber(quote)}.pdf` };
}

export async function sendDirectClientDocument(input: { phone: string; kind: ClientDocumentKind; documentId: string }) {
  const { lead, record } = await loadDocument(input);
  // Direct outreach always uses the configured Mary sender and an approved template.
  // No inbound client message or artificial service window is needed.
  if (input.kind === "receipt") return sendBrandedReceiptPdf({ lead, payment: record as unknown as VerifiedPayment, forceTemplate: true });
  const result = await sendCommercialPdf({ lead, record: record as unknown as CommercialRecord, forceTemplate: true });
  await addMessage(lead.phone, "assistant", `[Human: MedMinds Sales] Quotation ${result.documentNumber} submitted through Meta template. Delivery confirmation pending.`, result.messageId);
  await recordOutgoingMessageAccepted({ phone: lead.phone, messageId: result.messageId }).catch(() => undefined);
  return result;
}
