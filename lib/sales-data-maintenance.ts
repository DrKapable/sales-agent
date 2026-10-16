import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { ensureFinancialColumns } from "@/lib/payment-finance";

let client: NeonQueryFunction<false, false> | null = null;

function database() {
  if (!process.env.DATABASE_URL) throw new Error("Persistent sales database is unavailable.");
  client ??= neon(process.env.DATABASE_URL);
  return client;
}

/** Deletes a mistaken entry, not the underlying bank or mobile-money transaction. */
export async function deleteSalesPayment(id: string) {
  await ensureFinancialColumns();
  const db = database();
  await db.query(`CREATE TABLE IF NOT EXISTS sales_deleted_payments (
    id UUID PRIMARY KEY,
    payment_snapshot JSONB NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // Archive and remove in the same PostgreSQL statement: both succeed or neither does.
  const rows = await db.query(
    `WITH removed AS (DELETE FROM client_payments WHERE id=$1 RETURNING *),
    archived AS (
      INSERT INTO sales_deleted_payments (id, payment_snapshot)
      SELECT id, to_jsonb(removed) FROM removed RETURNING id
    )
    SELECT removed.* FROM removed INNER JOIN archived USING (id)`,
    [id]
  );
  if (!rows.length) throw new Error("Payment not found or already deleted.");
  return { id: String(rows[0].id), status: String(rows[0].status), amountZmw: Number(rows[0].amount_zmw) };
}

/**
 * Clears sales activity while retaining catalogue, integration credentials,
 * team configuration, system settings and a database-level recovery archive.
 * TRUNCATE RESTRICT fails atomically if an unknown dependent table exists.
 */
export async function resetSalesActivity() {
  const db = database();
  const resetId = crypto.randomUUID();
  const tables = [
    "business_tasks", "client_payments", "sales_quotes", "client_feedback",
    "client_documents", "messages", "archived_chats", "leads",
    "human_follow_up_tasks", "lead_follow_up_state", "lead_follow_up_events",
    "business_event_notifications", "explee_hot_lead_imports"
  ];
  // The table names above and resetId are source-controlled/generated values,
  // never derived from caller-supplied input.
  const tableSql = tables.map((table) => `'${table}'`).join(", ");
  const block = `DO $sales_reset$
  DECLARE
    current_table TEXT;
    affected_tables TEXT[] := ARRAY[]::TEXT[];
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('medminds_sales_data_reset'));
    CREATE TABLE IF NOT EXISTS sales_reset_archive (
      reset_id UUID NOT NULL,
      table_name TEXT NOT NULL,
      row_snapshot JSONB NOT NULL,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    FOREACH current_table IN ARRAY ARRAY[${tableSql}] LOOP
      IF to_regclass(format('public.%I', current_table)) IS NOT NULL THEN
        EXECUTE format(
          'INSERT INTO sales_reset_archive (reset_id,table_name,row_snapshot)
           SELECT %L::uuid, %L, to_jsonb(source_row) FROM public.%I source_row',
          '${resetId}', current_table, current_table
        );
        affected_tables := array_append(affected_tables, format('public.%I', current_table));
      END IF;
    END LOOP;
    IF cardinality(affected_tables) > 0 THEN
      EXECUTE 'TRUNCATE TABLE ' || array_to_string(affected_tables, ', ') || ' RESTRICT';
    END IF;
  END $sales_reset$`;
  await db.query(block);
  const counts = await db.query(
    `SELECT table_name, COUNT(*)::INT AS row_count FROM sales_reset_archive
     WHERE reset_id=$1 GROUP BY table_name ORDER BY table_name`, [resetId]
  );
  return { resetId, affected: counts.map((row) => ({ table: String(row.table_name), rows: Number(row.row_count) })) };
}
