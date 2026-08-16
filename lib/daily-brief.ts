import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getBusinessSnapshot } from "@/lib/business-ops";
import { getFollowUpPerformance } from "@/lib/follow-up";
import { referralRecipients } from "@/lib/referrals";
import { sendWhatsAppText } from "@/lib/whatsapp";

let sql: NeonQueryFunction<false, false> | null = null;
function db() { if (!process.env.DATABASE_URL) return null; sql ??= neon(process.env.DATABASE_URL); return sql; }

async function claimToday() {
  const database = db();
  if (!database) return true;
  await database.query(`CREATE TABLE IF NOT EXISTS daily_management_briefs (brief_date DATE PRIMARY KEY, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const rows = await database.query(`INSERT INTO daily_management_briefs (brief_date) VALUES (CURRENT_DATE) ON CONFLICT DO NOTHING RETURNING brief_date`);
  return rows.length > 0;
}

export async function runDailyManagementBrief() {
  if (!(await claimToday())) return { sent: false, reason: "already_sent" };
  const [snapshot, followUpPerformance] = await Promise.all([
    getBusinessSnapshot(),
    getFollowUpPerformance(30).catch(() => ({ days: 30, sent: 0, responded: 0, responseRate: 0, freeform: 0, templates: 0 }))
  ]);
  const topServices = snapshot.services.slice(0, 3).map((row) => `${row.service}: ${row.leads} leads, ${row.conversionRate}% converted`).join("\n") || "No service data yet";
  const hot = snapshot.leads.filter((lead) => lead.scoreBand === "HOT" && lead.status !== "CONVERTED").slice(0, 5).map((lead) => `${lead.name || lead.phone} (${lead.leadScore}/100) - ${lead.serviceInterest || "service not established"}`).join("\n") || "None";
  const lost = snapshot.lostReasons.slice(0, 3).map((row) => `${row.reason}: ${row.count}`).join("\n") || "None";
  const body = [
    "MedMinds daily management brief",
    `Total leads: ${snapshot.metrics.totalLeads}`,
    `Conversion: ${snapshot.metrics.conversionRate}% (${snapshot.metrics.converted} converted)`,
    `Hot unconverted leads: ${snapshot.metrics.hotLeads}`,
    `Follow-ups due: ${snapshot.metrics.followUpsDue}`,
    `Automated follow-ups (30d): ${followUpPerformance.sent} sent, ${followUpPerformance.responded} replies (${followUpPerformance.responseRate}%)`,
    `Follow-up delivery mix: ${followUpPerformance.freeform} personalised, ${followUpPerformance.templates} templates`,
    `Payment pending: ${snapshot.metrics.paymentPending}`,
    "", "Top services", topServices,
    "", "Highest-priority leads", hot,
    "", "Lost-lead signals", lost
  ].join("\n");

  const recipients = [
    { recipient: referralRecipients.kanyembo, label: "PRIMARY" },
    { recipient: referralRecipients.mustafa, label: "CC" },
    { recipient: referralRecipients.conrad, label: "CC" },
    { recipient: referralRecipients.zabibu, label: "CC" }
  ];
  const results = [];
  for (const { recipient, label } of recipients) {
    if (!recipient.phone) continue;
    try { await sendWhatsAppText(recipient.phone, `${label} - ${body}`); results.push({ recipient: recipient.name, sent: true }); }
    catch (error) { console.error("Daily management brief failed", { recipient: recipient.name, error }); results.push({ recipient: recipient.name, sent: false }); }
  }
  return { sent: results.some((item) => item.sent), results, followUpPerformance };
}
