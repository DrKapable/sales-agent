import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { ConversationMessage } from "@/lib/types";

export type MessageDeliveryStatus = "ACCEPTED" | "SENT" | "DELIVERED" | "READ" | "FAILED";

const STATUS_RANK: Record<MessageDeliveryStatus, number> = {
  ACCEPTED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 99
};

const ADMIN_MARKERS: Record<MessageDeliveryStatus, string> = {
  ACCEPTED: "\u2063\u200B\u2063",
  SENT: "\u2063\u200C\u2063",
  DELIVERED: "\u2063\u200D\u2063",
  READ: "\u2063\u2060\u2063",
  FAILED: "\u2063\uFEFF\u2063"
};

let sql: NeonQueryFunction<false, false> | null = null;
let setup: Promise<void> | null = null;
const memory = new Map<string, { phone: string; status: MessageDeliveryStatus; error: string | null; updatedAt: string }>();

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureTable() {
  const db = database();
  if (!db) return;
  setup ??= db.query(`CREATE TABLE IF NOT EXISTS message_delivery_status (
    message_id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACCEPTED',
    error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).then(() => undefined);
  await setup;
}

function normalizeStatus(value: string): MessageDeliveryStatus | null {
  const status = value.toUpperCase();
  return ["SENT", "DELIVERED", "READ", "FAILED"].includes(status) ? status as MessageDeliveryStatus : null;
}

export async function recordOutgoingMessageAccepted(input: { messageId: string; phone: string }) {
  const now = new Date().toISOString();
  const remembered = memory.get(input.messageId);
  if (!remembered || STATUS_RANK[remembered.status] < STATUS_RANK.ACCEPTED) {
    memory.set(input.messageId, { phone: input.phone, status: "ACCEPTED", error: null, updatedAt: now });
  }

  await ensureTable();
  const db = database();
  if (!db) return;
  const rows = await db.query(`SELECT status FROM message_delivery_status WHERE message_id=$1 LIMIT 1`, [input.messageId]);
  const current = rows[0]?.status ? String(rows[0].status).toUpperCase() as MessageDeliveryStatus : null;
  if (current && STATUS_RANK[current] >= STATUS_RANK.ACCEPTED) return;
  await db.query(
    `INSERT INTO message_delivery_status (message_id,phone,status,error,updated_at)
     VALUES ($1,$2,'ACCEPTED',NULL,NOW())
     ON CONFLICT (message_id) DO UPDATE SET phone=$2,status='ACCEPTED',error=NULL,updated_at=NOW()`,
    [input.messageId, input.phone]
  );
}

export async function applyMessageDeliveryReceipt(input: {
  messageId: string;
  status: string;
  recipientId?: string | null;
  error?: string | null;
}) {
  const next = normalizeStatus(input.status);
  if (!next) return false;
  const now = new Date().toISOString();
  const remembered = memory.get(input.messageId);
  if (!remembered || next === "FAILED" || STATUS_RANK[next] >= STATUS_RANK[remembered.status]) {
    memory.set(input.messageId, {
      phone: input.recipientId || remembered?.phone || "unknown",
      status: next,
      error: next === "FAILED" ? (input.error || "Meta reported delivery failure.") : null,
      updatedAt: now
    });
  }

  await ensureTable();
  const db = database();
  if (!db) return true;
  const rows = await db.query(`SELECT phone,status FROM message_delivery_status WHERE message_id=$1 LIMIT 1`, [input.messageId]);
  const row = rows[0] as { phone?: string; status?: string } | undefined;
  const current = row?.status ? String(row.status).toUpperCase() as MessageDeliveryStatus : null;
  if (current && next !== "FAILED" && STATUS_RANK[current] > STATUS_RANK[next]) return true;
  const phone = input.recipientId || row?.phone || "unknown";
  await db.query(
    `INSERT INTO message_delivery_status (message_id,phone,status,error,updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (message_id) DO UPDATE SET
       phone=CASE WHEN EXCLUDED.phone='unknown' THEN message_delivery_status.phone ELSE EXCLUDED.phone END,
       status=$3,error=$4,updated_at=NOW()`,
    [input.messageId, phone, next, next === "FAILED" ? (input.error || "Meta reported delivery failure.") : null]
  );
  return true;
}

export async function decorateMessagesForAdmin(messages: ConversationMessage[]) {
  const outgoing = messages.filter((message) => message.role === "assistant" && message.externalId);
  if (!outgoing.length) return messages;

  const statusById = new Map<string, MessageDeliveryStatus>();
  for (const message of outgoing) {
    if (!message.externalId) continue;
    const remembered = memory.get(message.externalId);
    if (remembered) statusById.set(message.externalId, remembered.status);
  }

  await ensureTable();
  const db = database();
  if (db) {
    const ids = [...new Set(outgoing.map((message) => message.externalId).filter((value): value is string => Boolean(value)))];
    if (ids.length) {
      const rows = await db.query(`SELECT message_id,status FROM message_delivery_status WHERE message_id = ANY($1::text[])`, [ids]);
      for (const row of rows) {
        const id = String(row.message_id || "");
        const status = String(row.status || "ACCEPTED").toUpperCase() as MessageDeliveryStatus;
        if (id && STATUS_RANK[status]) statusById.set(id, status);
      }
    }
  }

  return messages.map((message) => {
    if (message.role !== "assistant" || !message.externalId) return message;
    const status = statusById.get(message.externalId) || "ACCEPTED";
    return { ...message, content: `${message.content}${ADMIN_MARKERS[status]}` };
  });
}
