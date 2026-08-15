import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Keep conversation data and all lead-linked business records in sync when an administrator deletes clients.
const CLIENT_BUSINESS_TABLES = ["business_tasks", "client_payments", "sales_quotes", "client_feedback", "client_documents"] as const;

type Database = NeonQueryFunction<false, false>;

let sql: Database | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function tableExists(db: Database, table: string) {
  const rows = await db.query(`SELECT to_regclass($1) AS relation`, [`public.${table}`]);
  return Boolean(rows[0]?.relation);
}

async function deleteBusinessRowsForLead(db: Database, leadId: string) {
  for (const table of CLIENT_BUSINESS_TABLES) {
    if (await tableExists(db, table)) {
      await db.query(`DELETE FROM ${table} WHERE lead_id=$1`, [leadId]);
    }
  }
}

export async function deleteClientRecord(phone: string) {
  const db = database();
  if (!db) throw new Error("Permanent deletion requires persistent database storage.");

  let leadId: string | null = null;
  if (await tableExists(db, "leads")) {
    const rows = await db.query(`SELECT id FROM leads WHERE phone=$1 LIMIT 1`, [phone]);
    leadId = rows[0]?.id ? String(rows[0].id) : null;
  }

  if (leadId) await deleteBusinessRowsForLead(db, leadId);
  if (await tableExists(db, "messages")) await db.query(`DELETE FROM messages WHERE phone=$1`, [phone]);
  if (await tableExists(db, "archived_chats")) await db.query(`DELETE FROM archived_chats WHERE phone=$1`, [phone]);

  let deletedClients = 0;
  if (await tableExists(db, "leads")) {
    const deleted = await db.query(`DELETE FROM leads WHERE phone=$1 RETURNING id`, [phone]);
    deletedClients = deleted.length;
  }

  return { deletedClients };
}

export async function deleteAllClientRecords() {
  const db = database();
  if (!db) throw new Error("Permanent deletion requires persistent database storage.");

  let deletedClients = 0;
  if (await tableExists(db, "leads")) {
    const rows = await db.query(`SELECT COUNT(*)::int AS count FROM leads`);
    deletedClients = Number(rows[0]?.count ?? 0);
  }

  for (const table of CLIENT_BUSINESS_TABLES) {
    if (await tableExists(db, table)) {
      await db.query(`DELETE FROM ${table} WHERE lead_id IS NOT NULL`);
    }
  }

  if (await tableExists(db, "messages")) await db.query(`DELETE FROM messages`);
  if (await tableExists(db, "archived_chats")) await db.query(`DELETE FROM archived_chats`);
  if (await tableExists(db, "leads")) await db.query(`DELETE FROM leads`);

  return { deletedClients };
}
