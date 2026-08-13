import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type WhatsAppSenderCandidate = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  source: "client" | "observed" | "configured";
};

let sql: NeonQueryFunction<false, false> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

export async function getWhatsAppSenderCandidates(phone: string): Promise<WhatsAppSenderCandidate[]> {
  const candidates: WhatsAppSenderCandidate[] = [];
  const seen = new Set<string>();
  const push = (candidate: WhatsAppSenderCandidate) => {
    if (!/^\d+$/.test(candidate.phoneNumberId) || seen.has(candidate.phoneNumberId)) return;
    seen.add(candidate.phoneNumberId);
    candidates.push(candidate);
  };

  const db = database();
  if (db) {
    await db.query(`CREATE TABLE IF NOT EXISTS whatsapp_sender_context (
      phone TEXT PRIMARY KEY,
      phone_number_id TEXT NOT NULL,
      display_phone_number TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const exact = await db.query(
      `SELECT phone_number_id,display_phone_number FROM whatsapp_sender_context WHERE phone=$1 LIMIT 1`,
      [phone]
    );
    if (exact[0]) {
      push({
        phoneNumberId: String(exact[0].phone_number_id),
        displayPhoneNumber: exact[0].display_phone_number ? String(exact[0].display_phone_number) : null,
        source: "client"
      });
    }

    const observed = await db.query(
      `SELECT phone_number_id,display_phone_number,MAX(updated_at) AS last_seen
       FROM whatsapp_sender_context
       GROUP BY phone_number_id,display_phone_number
       ORDER BY last_seen DESC
       LIMIT 10`
    );
    for (const row of observed) {
      push({
        phoneNumberId: String(row.phone_number_id),
        displayPhoneNumber: row.display_phone_number ? String(row.display_phone_number) : null,
        source: "observed"
      });
    }
  }

  const configured = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (configured) push({ phoneNumberId: configured, displayPhoneNumber: null, source: "configured" });
  return candidates;
}
