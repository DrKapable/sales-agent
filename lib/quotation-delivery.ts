import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type QuoteDeliveryStatus = "NOT_SENT" | "ACCEPTED" | "SENT" | "DELIVERED" | "READ" | "FAILED";

let sql: NeonQueryFunction<false, false> | null = null;
let setup: Promise<void> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

export async function ensureQuoteDeliveryColumns() {
  const db = database();
  if (!db) return;
  setup ??= (async () => {
    await db.query(`ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'NOT_SENT'`);
    await db.query(`ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS delivery_message_id TEXT`);
    await db.query(`ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS delivery_error TEXT`);
    await db.query(`ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`);
    await db.query(`CREATE INDEX IF NOT EXISTS sales_quotes_delivery_message_idx ON sales_quotes(delivery_message_id)`);
  })();
  await setup;
}

export async function markQuoteAccepted(quoteId: string, messageId: string) {
  await ensureQuoteDeliveryColumns();
  const db = database();
  if (!db) return;
  await db.query(
    `UPDATE sales_quotes
     SET delivery_status='ACCEPTED', delivery_message_id=$2, delivery_error=NULL, submitted_at=NOW()
     WHERE id=$1`,
    [quoteId, messageId]
  );
}

const statusRank: Record<QuoteDeliveryStatus, number> = {
  NOT_SENT: 0,
  ACCEPTED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 99
};

function normalizeStatus(value: string): QuoteDeliveryStatus | null {
  const status = value.toUpperCase();
  return ["SENT", "DELIVERED", "READ", "FAILED"].includes(status) ? status as QuoteDeliveryStatus : null;
}

export async function applyQuoteDeliveryReceipt(input: {
  messageId: string;
  status: string;
  timestamp?: string | null;
  error?: string | null;
}) {
  const next = normalizeStatus(input.status);
  if (!next) return false;
  await ensureQuoteDeliveryColumns();
  const db = database();
  if (!db) return false;
  const rows = await db.query(
    `SELECT id,delivery_status FROM sales_quotes WHERE delivery_message_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [input.messageId]
  );
  const row = rows[0] as { id?: string; delivery_status?: string } | undefined;
  if (!row?.id) return false;
  const current = (String(row.delivery_status || "NOT_SENT").toUpperCase() as QuoteDeliveryStatus);
  if (next !== "FAILED" && (statusRank[current] ?? 0) > statusRank[next]) return true;
  const occurredAt = input.timestamp && /^\d+$/.test(input.timestamp)
    ? new Date(Number(input.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  await db.query(
    `UPDATE sales_quotes
     SET delivery_status=$2,
         delivery_error=$3,
         delivered_at=CASE WHEN $2 IN ('DELIVERED','READ') THEN COALESCE(delivered_at,$4::timestamptz) ELSE delivered_at END
     WHERE id=$1`,
    [row.id, next, next === "FAILED" ? (input.error || "Meta reported delivery failure.") : null, occurredAt]
  );
  return true;
}
