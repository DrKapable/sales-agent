import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type WhatsAppSenderContext = {
  phone: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  updatedAt: string;
};

const memory = new Map<string, WhatsAppSenderContext>();
let sql: NeonQueryFunction<false, false> | null = null;
let setup: Promise<void> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureTable() {
  const db = database();
  if (!db) return;
  setup ??= db.query(`CREATE TABLE IF NOT EXISTS whatsapp_sender_context (
    phone TEXT PRIMARY KEY,
    phone_number_id TEXT NOT NULL,
    display_phone_number TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).then(() => undefined);
  await setup;
}

export async function rememberWhatsAppSender(input: { phone: string; phoneNumberId?: string | null; displayPhoneNumber?: string | null }) {
  if (!input.phoneNumberId || !/^\d+$/.test(input.phoneNumberId)) return null;
  const context: WhatsAppSenderContext = {
    phone: input.phone,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: input.displayPhoneNumber || null,
    updatedAt: new Date().toISOString()
  };
  memory.set(input.phone, context);
  await ensureTable();
  const db = database();
  if (db) {
    await db.query(
      `INSERT INTO whatsapp_sender_context (phone,phone_number_id,display_phone_number,updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (phone) DO UPDATE SET phone_number_id=$2,display_phone_number=$3,updated_at=NOW()`,
      [input.phone, input.phoneNumberId, input.displayPhoneNumber || null]
    );
  }
  return context;
}

export async function getWhatsAppSender(phone: string): Promise<WhatsAppSenderContext | null> {
  await ensureTable();
  const db = database();
  if (!db) return memory.get(phone) || null;
  const rows = await db.query(
    `SELECT phone,phone_number_id,display_phone_number,updated_at FROM whatsapp_sender_context WHERE phone=$1 LIMIT 1`,
    [phone]
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return memory.get(phone) || null;
  return {
    phone: String(row.phone),
    phoneNumberId: String(row.phone_number_id),
    displayPhoneNumber: row.display_phone_number ? String(row.display_phone_number) : null,
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}
