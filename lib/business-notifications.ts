import { referralRecipients } from "@/lib/referrals";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { listLeads } from "@/lib/store";
import type { Lead } from "@/lib/types";

export type BusinessEventType = "hot_lead" | "quote_created" | "payment_pending" | "payment_verified" | "research_task_created" | "review_requested" | "operations_task";

const recipientMap: Record<BusinessEventType, { primary: string; cc: string[] }> = {
  hot_lead: { primary: "kanyembo", cc: ["mustafa"] },
  quote_created: { primary: "kanyembo", cc: ["mustafa"] },
  payment_pending: { primary: "mustafa", cc: ["kanyembo"] },
  payment_verified: { primary: "mustafa", cc: ["kanyembo"] },
  research_task_created: { primary: "madalitso", cc: ["mustafa"] },
  review_requested: { primary: "zabibu", cc: ["conrad"] },
  operations_task: { primary: "madalitso", cc: ["mustafa"] }
};

const memoryClaims = new Set<string>();

async function claimEvent(eventKey: string) {
  if (memoryClaims.has(eventKey)) return false;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) { memoryClaims.add(eventKey); return true; }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(databaseUrl);
  await sql.query(`CREATE TABLE IF NOT EXISTS business_event_notifications (
    event_key TEXT PRIMARY KEY, event_type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const rows = await sql.query(`INSERT INTO business_event_notifications (event_key,event_type) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING event_key`, [eventKey, eventKey.split(":")[0]]);
  return rows.length > 0;
}

export async function notifyBusinessEvent(input: {
  type: BusinessEventType;
  eventKey: string;
  title: string;
  body: string;
  lead?: Lead | null;
}) {
  if (!(await claimEvent(input.eventKey))) return { sent: false, reason: "duplicate" };
  const route = recipientMap[input.type];
  const primary = referralRecipients[route.primary];
  const cc = route.cc.map((key) => referralRecipients[key]).filter(Boolean);
  const leadLine = input.lead ? `\nClient: ${input.lead.name || "Not provided"} (${input.lead.phone.startsWith("+") ? input.lead.phone : `+${input.lead.phone}`})` : "";
  const base = `${input.title}${leadLine}\n${input.body}`.replaceAll("—", ",");
  const results: Array<{ recipient: string; sent: boolean }> = [];
  for (const [index, recipient] of [primary, ...cc].entries()) {
    if (!recipient?.phone) continue;
    try {
      await sendWhatsAppText(recipient.phone, `${index === 0 ? "PRIMARY" : "CC"} - ${base}`);
      results.push({ recipient: recipient.name, sent: true });
    } catch (error) {
      console.error("Business event WhatsApp notification failed", { type: input.type, recipient: recipient.name, error });
      results.push({ recipient: recipient.name, sent: false });
    }
  }
  return { sent: results.some((item) => item.sent), results };
}

export async function maybeNotifyHotLead(phone: string) {
  const lead = (await listLeads()).find((item) => item.phone === phone);
  if (!lead || lead.status === "CONVERTED" || lead.status === "LOST LEAD") return;
  const { scoreLead } = await import("@/lib/business-ops");
  const score = await scoreLead(lead);
  if (score.score < 70) return;
  await notifyBusinessEvent({
    type: "hot_lead",
    eventKey: `hot_lead:${lead.id}`,
    title: "Hot MedMinds lead",
    body: `Lead score: ${score.score}/100\nService: ${lead.serviceInterest || lead.packageName || "Not established"}\nStatus: ${lead.status}\nSales follow-up should be prioritised.`,
    lead
  });
}
