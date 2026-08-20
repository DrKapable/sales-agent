import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;
let setup: Promise<void> | null = null;

function db() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

export function paymentBreakdown(totalChargedZmw: number, amountPaidZmw: number) {
  const total = Math.round(Number(totalChargedZmw) * 100) / 100;
  const paid = Math.round(Number(amountPaidZmw) * 100) / 100;
  if (!Number.isFinite(total) || total <= 0) throw new Error("Enter a valid total charged amount.");
  if (!Number.isFinite(paid) || paid <= 0) throw new Error("Enter a valid amount paid.");
  if (paid > total) throw new Error("Amount paid cannot be greater than total charged.");
  return { totalChargedZmw: total, amountPaidZmw: paid, balanceZmw: Math.round((total - paid) * 100) / 100 };
}

export async function ensureFinancialColumns() {
  const database = db();
  if (!database) throw new Error("Persistent database storage is required.");
  setup ??= (async () => {
    await database.query(`CREATE TABLE IF NOT EXISTS client_payments (
      id UUID PRIMARY KEY, lead_id UUID, amount_zmw NUMERIC NOT NULL,
      reference TEXT, status TEXT NOT NULL DEFAULT 'PENDING', verified_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), verified_at TIMESTAMPTZ
    )`);
    await database.query(`ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS total_charged_zmw NUMERIC`);
    await database.query(`ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS amount_paid_zmw NUMERIC`);
    await database.query(`ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS balance_zmw NUMERIC`);
    await database.query(`UPDATE client_payments SET amount_paid_zmw=amount_zmw WHERE amount_paid_zmw IS NULL`);
    await database.query(`UPDATE client_payments SET total_charged_zmw=amount_zmw WHERE total_charged_zmw IS NULL`);
    await database.query(`UPDATE client_payments SET balance_zmw=GREATEST(COALESCE(total_charged_zmw,amount_zmw)-COALESCE(amount_paid_zmw,amount_zmw),0) WHERE balance_zmw IS NULL`);

    await database.query(`CREATE TABLE IF NOT EXISTS sales_quotes (
      id UUID PRIMARY KEY, lead_id UUID, service TEXT NOT NULL, amount_zmw NUMERIC,
      details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await database.query(`ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS total_charged_zmw NUMERIC`);
    await database.query(`ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS amount_paid_zmw NUMERIC`);
    await database.query(`ALTER TABLE sales_quotes ADD COLUMN IF NOT EXISTS balance_zmw NUMERIC`);
  })();
  await setup;
}

async function syncInvoice(input: { leadId: string; service?: string | null; totalChargedZmw: number; amountPaidZmw: number; balanceZmw: number }) {
  const database = db();
  if (!database) return null;
  const existingRows = await database.query(`SELECT * FROM sales_quotes WHERE lead_id=$1 AND status='INVOICE_UNPAID' ORDER BY created_at DESC LIMIT 1`, [input.leadId]);
  const existing = existingRows[0] as any;

  if (input.balanceZmw <= 0) {
    if (existing?.id) {
      await database.query(`UPDATE sales_quotes SET total_charged_zmw=$2,amount_paid_zmw=$3,balance_zmw=0,status='INVOICE_PAID' WHERE id=$1`, [existing.id, input.totalChargedZmw, input.amountPaidZmw]);
    }
    return null;
  }

  const quoteRows = await database.query(`SELECT service,details FROM sales_quotes WHERE lead_id=$1 AND status IN ('QUOTATION','DRAFT') ORDER BY created_at DESC LIMIT 1`, [input.leadId]);
  const quote = quoteRows[0] as any;
  const service = input.service?.trim() || quote?.service || "MedMinds service";
  const details = quote?.details || `Outstanding invoice for ${service}.`;

  if (existing?.id) {
    const rows = await database.query(`UPDATE sales_quotes SET service=$2,amount_zmw=$3,total_charged_zmw=$3,amount_paid_zmw=$4,balance_zmw=$5,details=$6,status='INVOICE_UNPAID' WHERE id=$1 RETURNING *`, [existing.id, service, input.totalChargedZmw, input.amountPaidZmw, input.balanceZmw, details]);
    return rows[0] || null;
  }

  const rows = await database.query(`INSERT INTO sales_quotes (id,lead_id,service,amount_zmw,total_charged_zmw,amount_paid_zmw,balance_zmw,details,status) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,'INVOICE_UNPAID') RETURNING *`, [crypto.randomUUID(), input.leadId, service, input.totalChargedZmw, input.amountPaidZmw, input.balanceZmw, details]);
  return rows[0] || null;
}

export async function recordFinancialPayment(input: {
  leadId: string;
  totalChargedZmw: number;
  amountPaidZmw: number;
  reference?: string | null;
  verified?: boolean;
  verifiedBy?: string | null;
  service?: string | null;
}) {
  await ensureFinancialColumns();
  const database = db();
  if (!database) throw new Error("Persistent database storage is required.");
  const money = paymentBreakdown(input.totalChargedZmw, input.amountPaidZmw);
  const rows = await database.query(
    `INSERT INTO client_payments (id,lead_id,amount_zmw,total_charged_zmw,amount_paid_zmw,balance_zmw,reference,status,verified_by,verified_at)
     VALUES ($1,$2,$3,$4,$3,$5,$6,$7,$8,$9) RETURNING *`,
    [crypto.randomUUID(), input.leadId, money.amountPaidZmw, money.totalChargedZmw, money.balanceZmw, input.reference || null, input.verified ? "VERIFIED" : "PENDING", input.verified ? (input.verifiedBy || "Admin") : null, input.verified ? new Date().toISOString() : null]
  );
  const payment = rows[0];
  const invoice = await syncInvoice({ leadId: input.leadId, service: input.service, ...money });
  return { payment, invoice, ...money };
}
