import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { restoreChat } from "@/lib/chat-lifecycle";
import { getOrCreateLead } from "@/lib/store";
import { WALIMA_CAMPAIGN, WALIMA_CARD_PREFIX } from "@/lib/walima-knowledge";

export const invitationImport = z.object({
  campaign: z.literal(WALIMA_CAMPAIGN),
  records: z.array(z.object({
    recipient: z.string().regex(/^[1-9]\d{7,14}$/), guest_name: z.string().min(2).max(120),
    message_id: z.string().startsWith("wamid.").max(250),
    status: z.enum(["accepted","sent","delivered","read","failed"]),
    created_at: z.string().refine(v => Number.isFinite(Date.parse(v))),
    content: z.string().min(20).max(5000)
  })).max(200)
});
function db() { if (!process.env.DATABASE_URL) throw new Error("Persistent inbox unavailable"); return neon(process.env.DATABASE_URL); }
let setup: Promise<unknown> | undefined;
export async function weddingDatabase() {
  const sql=db();
  setup ??= sql.query(`CREATE TABLE IF NOT EXISTS walima_guest_context (
    phone TEXT PRIMARY KEY, campaign TEXT NOT NULL, guest_name TEXT NOT NULL, invitation_id TEXT UNIQUE NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_reply_at TIMESTAMPTZ
  )`).catch(error=>{setup=undefined;throw error;});
  await setup; return sql;
}
export async function importInvitations(input: z.infer<typeof invitationImport>) {
  const sql=await weddingDatabase(); let imported=0; const paused: string[]=[];
  for(const record of input.records) {
    const lead=await getOrCreateLead(record.recipient,"whatsapp");
    if(lead.aiPaused) paused.push(record.guest_name);
    await restoreChat(record.recipient);
    await sql.query(`UPDATE leads SET name=COALESCE(name,$2), service_interest=COALESCE(service_interest,'Walima guest'), updated_at=GREATEST(updated_at,$3::timestamptz) WHERE phone=$1`,[record.recipient,record.guest_name,record.created_at]);
    await sql.query(`INSERT INTO walima_guest_context(phone,campaign,guest_name,invitation_id) VALUES($1,$2,$3,$4) ON CONFLICT(phone) DO UPDATE SET campaign=$2,guest_name=$3,invitation_id=$4`,[record.recipient,input.campaign,record.guest_name,record.message_id]);
    const rows=await sql.query(`INSERT INTO messages(id,external_id,phone,role,content,created_at) VALUES($1,$2,$3,'assistant',$4,$5) ON CONFLICT(external_id) DO NOTHING RETURNING id`,[crypto.randomUUID(),record.message_id,record.recipient,`${WALIMA_CARD_PREFIX}${record.guest_name}]\n\n${record.content}`,record.created_at]);
    imported+=rows.length;
    // Existing webhook receipts are authoritative; importing history must not downgrade them.
    await sql.query(`INSERT INTO message_delivery_status(message_id,phone,status,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(message_id) DO NOTHING`,[record.message_id,record.recipient,record.status.toUpperCase(),record.created_at]);
  }
  const rows=await sql.query(`SELECT count(*)::int AS contacts,count(m.id)::int AS messages FROM walima_guest_context g LEFT JOIN messages m ON m.external_id=g.invitation_id WHERE g.campaign=$1`,[input.campaign]);
  return {imported,...rows[0],paused};
}
