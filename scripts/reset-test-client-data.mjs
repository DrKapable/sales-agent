import { neon } from "@neondatabase/serverless";

const migrationId = "2026-08-12-clear-test-client-records-v1";
const clientBusinessTables = ["business_tasks", "client_payments", "sales_quotes", "client_feedback"];

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the one-time client data reset.");
}

const sql = neon(process.env.DATABASE_URL);

async function tableExists(table) {
  const rows = await sql.query(`SELECT to_regclass($1) AS relation`, [`public.${table}`]);
  return Boolean(rows[0]?.relation);
}

await sql.query(`CREATE TABLE IF NOT EXISTS app_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);

const claimed = await sql.query(
  `INSERT INTO app_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id`,
  [migrationId]
);

if (!claimed.length) {
  console.log("Client test-data reset already applied.");
  process.exit(0);
}

try {
  let count = 0;
  if (await tableExists("leads")) {
    const rows = await sql.query(`SELECT COUNT(*)::int AS count FROM leads`);
    count = Number(rows[0]?.count ?? 0);
  }

  for (const table of clientBusinessTables) {
    if (await tableExists(table)) await sql.query(`DELETE FROM ${table} WHERE lead_id IS NOT NULL`);
  }

  if (await tableExists("messages")) await sql.query(`DELETE FROM messages`);
  if (await tableExists("archived_chats")) await sql.query(`DELETE FROM archived_chats`);
  if (await tableExists("leads")) await sql.query(`DELETE FROM leads`);

  console.log(`Cleared ${count} existing test client records.`);
} catch (error) {
  await sql.query(`DELETE FROM app_migrations WHERE id=$1`, [migrationId]).catch(() => undefined);
  throw error;
}
