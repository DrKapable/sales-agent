import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;
let setup: Promise<void> | null = null;

function db() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

function roundMoney(value: number) {
  return Math.round(Number(value) * 100) / 100;
}

export function paymentBreakdown(totalChargedZmw: number, amountPaidZmw: number) {
  const total = roundMoney(totalChargedZmw);
  const paid = roundMoney(amountPaidZmw);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Enter a valid total charged amount.");
  if (!Number.isFinite(paid) || paid <= 0) throw new Error("Enter a valid amount paid.");
  if (paid > total) throw new Error("Amount paid cannot be greater than total charged.");
  return { totalChargedZmw: total, amountPaidZmw: paid, balanceZmw: roundMoney(total - paid) };
}

export function cumulativePaymentBreakdown(totalChargedZmw: number, alreadyVerifiedZmw: number, paymentAmountZmw: number) {
  const total = roundMoney(totalChargedZmw);
  const prior = roundMoney(alreadyVerifiedZmw);
  const payment = roundMoney(paymentAmountZmw);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Enter a valid total charged amount.");
  if (!Number.isFinite(prior) || prior < 0) throw new Error("The previously verified amount is invalid.");
  if (!Number.isFinite(payment) || payment <= 0) throw new Error("Enter a valid amount paid.");
  if (prior > total) throw new Error("Previously verified payments are greater than the current total charge. Reconcile the client account before recording another payment.");
  const cumulative = roundMoney(prior + payment);
  if (cumulative > total) throw new Error(`This payment would exceed the remaining balance of K${roundMoney(total - prior).toLocaleString()}.`);
  return {
    totalChargedZmw: total,
    amountPaidZmw: payment,
    previousPaidZmw: prior,
    cumulativePaidZmw: cumulative,
    balanceZmw: roundMoney(total - cumulative)
  };
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

async function verifiedPaidForLead(leadId: string, excludePaymentId?: string | null) {
  const database = db();
  if (!database) return 0;
  const rows = excludePaymentId
    ? await database.query(
        `SELECT COALESCE(SUM(COALESCE(amount_paid_zmw,amount_zmw)),0) AS paid
         FROM client_payments WHERE lead_id=$1 AND status='VERIFIED' AND id<>$2::uuid`,
        [leadId, excludePaymentId]
      )
    : await database.query(
        `SELECT COALESCE(SUM(COALESCE(amount_paid_zmw,amount_zmw)),0) AS paid
         FROM client_payments WHERE lead_id=$1 AND status='VERIFIED'`,
        [leadId]
      );
  return roundMoney(Number((rows[0] as any)?.paid || 0));
}

async function syncInvoice(input: {
  leadId: string;
  service?: string | null;
  totalChargedZmw: number;
  cumulativePaidZmw: number;
  balanceZmw: number;
}) {
  const database = db();
  if (!database) return null;
  const existingRows = await database.query(
    `SELECT * FROM sales_quotes WHERE lead_id=$1 AND status IN ('INVOICE_UNPAID','INVOICE_PAID') ORDER BY created_at DESC LIMIT 1`,
    [input.leadId]
  );
  const existing = existingRows[0] as any;
  const quoteRows = await database.query(
    `SELECT service,details FROM sales_quotes WHERE lead_id=$1 AND status IN ('QUOTATION','DRAFT') ORDER BY created_at DESC LIMIT 1`,
    [input.leadId]
  );
  const quote = quoteRows[0] as any;
  const service = input.service?.trim() || quote?.service || existing?.service || "MedMinds service";
  const details = quote?.details || existing?.details || `Invoice for ${service}.`;
  const status = input.balanceZmw > 0 ? "INVOICE_UNPAID" : "INVOICE_PAID";

  if (existing?.id) {
    const rows = await database.query(
      `UPDATE sales_quotes SET service=$2,amount_zmw=$3,total_charged_zmw=$3,amount_paid_zmw=$4,balance_zmw=$5,details=$6,status=$7 WHERE id=$1 RETURNING *`,
      [existing.id, service, input.totalChargedZmw, input.cumulativePaidZmw, input.balanceZmw, details, status]
    );
    return rows[0] || null;
  }

  const rows = await database.query(
    `INSERT INTO sales_quotes (id,lead_id,service,amount_zmw,total_charged_zmw,amount_paid_zmw,balance_zmw,details,status)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8) RETURNING *`,
    [crypto.randomUUID(), input.leadId, service, input.totalChargedZmw, input.cumulativePaidZmw, input.balanceZmw, details, status]
  );
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

  const base = paymentBreakdown(input.totalChargedZmw, input.amountPaidZmw);
  const previouslyVerified = await verifiedPaidForLead(input.leadId);
  const projected = cumulativePaymentBreakdown(base.totalChargedZmw, previouslyVerified, base.amountPaidZmw);
  const cumulativeVerified = input.verified ? projected.cumulativePaidZmw : previouslyVerified;
  const officialBalance = roundMoney(base.totalChargedZmw - cumulativeVerified);

  const rows = await database.query(
    `INSERT INTO client_payments (id,lead_id,amount_zmw,total_charged_zmw,amount_paid_zmw,balance_zmw,reference,status,verified_by,verified_at)
     VALUES ($1,$2,$3,$4,$3,$5,$6,$7,$8,$9) RETURNING *`,
    [
      crypto.randomUUID(), input.leadId, base.amountPaidZmw, base.totalChargedZmw,
      input.verified ? officialBalance : projected.balanceZmw,
      input.reference || null,
      input.verified ? "VERIFIED" : "PENDING",
      input.verified ? (input.verifiedBy || "Admin") : null,
      input.verified ? new Date().toISOString() : null
    ]
  );
  const payment = rows[0];
  const invoice = await syncInvoice({
    leadId: input.leadId,
    service: input.service,
    totalChargedZmw: base.totalChargedZmw,
    cumulativePaidZmw: cumulativeVerified,
    balanceZmw: officialBalance
  });

  return {
    payment,
    invoice,
    totalChargedZmw: base.totalChargedZmw,
    amountPaidZmw: base.amountPaidZmw,
    previousPaidZmw: previouslyVerified,
    cumulativePaidZmw: cumulativeVerified,
    projectedCumulativePaidZmw: projected.cumulativePaidZmw,
    balanceZmw: input.verified ? officialBalance : projected.balanceZmw,
    officialBalanceZmw: officialBalance
  };
}

export async function verifyFinancialPayment(input: { paymentId: string; verifiedBy?: string | null }) {
  await ensureFinancialColumns();
  const database = db();
  if (!database) throw new Error("Persistent database storage is required.");

  const rows = await database.query(`SELECT * FROM client_payments WHERE id=$1 LIMIT 1`, [input.paymentId]);
  const payment = rows[0] as any;
  if (!payment) throw new Error("Payment not found.");

  const totalChargedZmw = roundMoney(Number(payment.total_charged_zmw ?? payment.amount_zmw));
  const amountPaidZmw = roundMoney(Number(payment.amount_paid_zmw ?? payment.amount_zmw));
  const previouslyVerified = await verifiedPaidForLead(String(payment.lead_id), String(payment.id));
  const ledger = cumulativePaymentBreakdown(totalChargedZmw, previouslyVerified, amountPaidZmw);

  const updatedRows = await database.query(
    `UPDATE client_payments
     SET status='VERIFIED',verified_by=$2,verified_at=COALESCE(verified_at,NOW()),balance_zmw=$3,total_charged_zmw=$4,amount_paid_zmw=$5
     WHERE id=$1 RETURNING *`,
    [payment.id, input.verifiedBy || payment.verified_by || "Admin", ledger.balanceZmw, ledger.totalChargedZmw, ledger.amountPaidZmw]
  );
  const updated = updatedRows[0] as any;

  const invoice = await syncInvoice({
    leadId: String(payment.lead_id),
    totalChargedZmw: ledger.totalChargedZmw,
    cumulativePaidZmw: ledger.cumulativePaidZmw,
    balanceZmw: ledger.balanceZmw
  });

  return { payment: updated, invoice, ...ledger };
}
