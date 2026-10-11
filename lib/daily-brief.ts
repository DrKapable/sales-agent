import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getBusinessActivityForPeriod } from "@/lib/business-ops";
import { getFollowUpActivityForPeriod } from "@/lib/follow-up";
import { previousLusakaDay } from "@/lib/daily-report-period";
import { referralRecipients } from "@/lib/referrals";
import { sendTeamCopies } from "@/lib/team-notifications";

let sql: NeonQueryFunction<false, false> | null = null;
function db() { if (!process.env.DATABASE_URL) return null; sql ??= neon(process.env.DATABASE_URL); return sql; }

async function claimDay(deliveryDate: string) {
  const database = db();
  if (!database) return true;
  await database.query(`CREATE TABLE IF NOT EXISTS daily_management_briefs (brief_date DATE PRIMARY KEY, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const rows = await database.query(`INSERT INTO daily_management_briefs (brief_date) VALUES ($1::date) ON CONFLICT DO NOTHING RETURNING brief_date`, [deliveryDate]);
  return rows.length > 0;
}

export async function runDailyManagementBrief(now = new Date()) {
  const period = previousLusakaDay(now);
  if (!(await claimDay(period.deliveryDate))) return { sent: false, reason: "already_sent" };
  try {
    const excludedPhones = Object.values(referralRecipients).flatMap((recipient) => recipient.phone ? [recipient.phone.replace(/\D/g, "")] : []);
    const [activity, followUpPerformance] = await Promise.all([
      getBusinessActivityForPeriod(period.start, period.end, excludedPhones),
      getFollowUpActivityForPeriod(period.start, period.end, excludedPhones)
    ]);
    const body = [
      `Report: ${period.label} (Zambia time, 00:00–23:59)`,
      `New clients: ${activity.newClients}`,
      `Clients who messaged: ${activity.activeClients}`,
      `Client messages: ${activity.clientMessages} | Team replies: ${activity.teamReplies}`,
      `Quotations/invoices created: ${activity.documentsCreated}`,
      `Payments recorded: ${activity.paymentsRecorded}`,
      `Payments verified: ${activity.paymentsVerified} | K${activity.verifiedAmountZmw.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`,
      `Tasks: ${activity.tasksCreated} created, ${activity.tasksCompleted} completed`,
      `Automated follow-ups: ${followUpPerformance.sent} sent | Replies received: ${followUpPerformance.responded}`,
      `Follow-up delivery: ${followUpPerformance.freeform} personalised, ${followUpPerformance.templates} templates`
    ].join("\n");

    const results = await sendTeamCopies({
      heading: "MedMinds daily management brief",
      body,
      primary: referralRecipients.mustafa,
      cc: [referralRecipients.kanyembo]
    });
    const directorSent = results.some((result) => result.status === "fulfilled"
      && result.value.recipient === referralRecipients.mustafa.name && result.value.sent);
    if (!directorSent) {
      throw new Error("The daily management brief was not accepted for the director; it remains eligible for retry.");
    }
    return {
      sent: results.some((result) => result.status === "fulfilled" && result.value.sent),
      results,
      reportDate: period.reportDate,
      period: { start: period.start, end: period.end, timeZone: period.timeZone },
      activity,
      followUpPerformance
    };
  } catch (error) {
    const database = db();
    if (database) await database.query(`DELETE FROM daily_management_briefs WHERE brief_date=$1::date`, [period.deliveryDate]);
    throw error;
  }
}
