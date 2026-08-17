import { referralRecipients } from "@/lib/referrals";
import { listLeads } from "@/lib/store";
import { sendTeamCopies } from "@/lib/team-notifications";
import type { Lead } from "@/lib/types";

export type BusinessEventType = "hot_lead" | "quote_created" | "payment_pending" | "payment_verified" | "receipt_sent" | "research_task_created" | "review_requested" | "operations_task";

const recipientMap: Record<BusinessEventType, { primary: string; cc: string[] }> = {
  hot_lead: { primary: "kanyembo", cc: [] },
  quote_created: { primary: "kanyembo", cc: [] },
  payment_pending: { primary: "mustafa", cc: ["kanyembo"] },
  payment_verified: { primary: "mustafa", cc: ["kanyembo"] },
  receipt_sent: { primary: "mustafa", cc: ["kanyembo"] },
  research_task_created: { primary: "monica", cc: [] },
  review_requested: { primary: "zabibu", cc: [] },
  operations_task: { primary: "monica", cc: [] }
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
  if (!primary) {
    console.error("Business event has no valid primary recipient", { type: input.type, recipientKey: route.primary });
    return { sent: false, reason: "missing_primary" };
  }
  const cc = route.cc.map((key) => referralRecipients[key]).filter(Boolean);
  const leadLine = input.lead ? `Client: ${input.lead.name || "Not provided"} (${input.lead.phone.startsWith("+") ? input.lead.phone : `+${input.lead.phone}`})` : null;
  const body = [leadLine, input.body].filter(Boolean).join("\n").replaceAll("—", ",");
  const results = await sendTeamCopies({
    heading: input.title,
    body,
    primary,
    cc
  });
  return {
    sent: results.some((result) => result.status === "fulfilled" && result.value.sent),
    results
  };
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
