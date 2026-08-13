import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { CommercialRecord } from "@/lib/commercial-document";

let sql: NeonQueryFunction<false, false> | null = null;

function db() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

export function isPreparedQuotationRequest(text: string) {
  const value = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const mentionsQuote = /\b(quote|quotation|proforma)\b/.test(value);
  const asksForDelivery = /\b(send|share|forward|give|show|prepared|ready|receive|get)\b/.test(value);
  return mentionsQuote && asksForDelivery;
}

export async function getLatestPreparedQuotation(leadId: string): Promise<CommercialRecord | null> {
  const database = db();
  if (!database) return null;
  const rows = await database.query(
    `SELECT id, service, amount_zmw, details, status, created_at
     FROM sales_quotes
     WHERE lead_id=$1 AND status IN ('QUOTATION','DRAFT')
     ORDER BY created_at DESC
     LIMIT 1`,
    [leadId]
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    service: String(row.service),
    amount_zmw: row.amount_zmw == null ? null : Number(row.amount_zmw),
    details: String(row.details),
    status: String(row.status),
    created_at: row.created_at ? String(row.created_at) : null
  };
}

export function preparedQuotationFallbackText(record: CommercialRecord) {
  const amount = record.amount_zmw == null ? "Tailored quotation" : `K${Number(record.amount_zmw).toLocaleString()}`;
  return `Here is your prepared MedMinds quotation:\n\nService: ${record.service}\nAmount: ${amount}\nDetails: ${record.details}\n\nPlease review it and let us know if you would like us to proceed or if you need any clarification.`;
}
