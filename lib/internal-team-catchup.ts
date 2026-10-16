import type { TeamMember } from "@/lib/internal-team-registry";
import { teamOverview, teamAttention, teamFinance, teamMarketing, type ReportPeriod } from "@/lib/internal-team-data";

type CatchUpSnapshot = {
  overview?: Record<string, unknown>;
  attention?: Record<string, unknown>;
  finance?: Record<string, unknown>;
  marketing?: Record<string, unknown>;
  unavailable?: string[];
};

/** Explicitly recognise business catch-up requests without relying on model tool selection. */
export function isManagementCatchUpRequest(text: string) {
  const message = text.replace(/^mary[,:\s-]*/i, "").trim().toLowerCase();
  // An instruction must never be treated as a read-only catch-up request.
  if (/^(assign|send|create|delete|update|mark|message|follow up with|confirm|cancel)\b/i.test(message)) return false;
  return /\b(what did i miss|what have i missed|what needs (my )?attention|catch me up|bring me up to speed|what (?:has )?happened|what(?:'s| is) (?:new|happening)|what changed|any (?:updates|new developments|priorities)|(?:daily|morning|management|business|sales|team) (?:brief|update|updates|summary|catch[ -]?up)|(?:updates?|brief|catch[ -]?up) (?:today|this morning|since yesterday)|anything (?:urgent|new)|what should i (?:focus on|prioriti[sz]e))\b/i.test(message);
}

function money(value: unknown) {
  return "K" + Number(value || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function localTime(now: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(now);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function number(value: unknown) {
  return Number(value || 0);
}

/** Pure formatter: every numeric claim originates in one of the supplied live-query results. */
export function formatManagementCatchUp(member: TeamMember, report: CatchUpSnapshot, period: ReportPeriod = "today", now = new Date()) {
  const lines: string[] = [
    "MedMinds management catch-up — " + localTime(now) + " (Zambia)",
    member.role === "director" ? "Dr. Juma:" : member.name + ":"
  ];
  const overview = report.overview;
  if (overview) {
    lines.push("Client scope: " + String(overview.scope || "authorised client records"));
    lines.push("New leads (" + period + "): " + number(overview.newLeadsInPeriod)
      + " | Current total: " + number(overview.totalLeads)
      + " | Converted: " + number(overview.converted));
    lines.push("Open HOT leads: " + number(overview.hotOpenLeads)
      + " | Follow-ups due: " + number(overview.followUpsDue));
  }

  if (member.role === "director" && report.finance) {
    const finance = isRecord(report.finance.summary) ? report.finance.summary : {};
    lines.push("Verified payments (" + period + "): "
      + money(finance.verifiedAmountZmw)
      + " (" + number(finance.verifiedPayments) + " records)");
    lines.push("Pending recorded payments (" + period + "): "
      + number(finance.pendingPayments) + " | " + money(finance.pendingAmountZmw));
  }

  if (member.role !== "marketing" && report.attention) {
    const leadBlock = isRecord(report.attention.leads) ? report.attention.leads : {};
    const attentionLeads = rows(leadBlock.clients);
    const tasks = rows(report.attention.openTasks);
    const topLeads = attentionLeads.slice(0, 3).map((lead) =>
      String(lead.name || lead.phone || "Unnamed client") + " (" + String(lead.status || "follow-up") + ")"
    );
    const overdue = tasks.filter((task) => task.overdue === true);
    lines.push("Priority sample: " + attentionLeads.length + " clients; " + tasks.length
      + " open tasks (" + overdue.length + " overdue in the displayed list)");
    if (topLeads.length) lines.push("Clients to review: " + topLeads.join("; "));
    if (overdue.length) lines.push("Overdue: " + overdue.slice(0, 2).map(t => String(t.title || "Task")).join("; "));
  }

  if (member.role === "marketing" && report.marketing) {
    const categories = rows(report.marketing.categories);
    lines.push("Top enquiry categories (last 7 days): "
      + (categories.slice(0, 3).map((c) => String(c.service || "Other") + " — " + number(c.enquiries)).join("; ") || "None recorded"));
  }

  const missing = report.unavailable || [];
  if (missing.length) lines.push("Not available right now: " + missing.join(", ") + ".");
  if (!overview && !report.finance && !report.attention && !report.marketing) {
    return "Mary here, " + (member.role === "director" ? "Dr. Juma" : member.name)
      + ". I couldn't obtain any verified live Sales figures just now. Please check the MedMinds Sales dashboard; I will not guess today's leads, payments or priorities.";
  }
  lines.push("These figures come from recorded CRM entries; payment verification is not independent bank reconciliation. Priority lists show a limited sample.");
  return lines.join("\n").slice(0,3900);
}

function statusToValue(outcome: PromiseSettledResult<unknown>, label: string, missing: string[]) {
  if (outcome.status === "fulfilled") return isRecord(outcome.value) ? outcome.value : undefined;
  missing.push(label);
  console.warn("Mary catch-up live data section unavailable", {
    section: label,
    reason: outcome.reason instanceof Error ? outcome.reason.message.slice(0, 180) : "unknown"
  });
  return undefined;
}

/** Each section is isolated, so unavailable payments never suppress a valid lead/priority brief. */
export async function getManagementCatchUp(member: TeamMember, period: ReportPeriod = "today", now = new Date()) {
  const results = await Promise.allSettled([
    teamOverview(member, period),
    member.role !== "marketing" ? teamAttention(member) : teamMarketing(member, "last7"),
    member.role === "director" ? teamFinance(member, period) : Promise.resolve(null)
  ]);
  const unavailable: string[] = [];
  const overview = statusToValue(results[0], "sales overview", unavailable);
  const secondary = statusToValue(results[1], member.role === "marketing" ? "marketing enquiries" : "operational priorities", unavailable);
  const finance = member.role === "director" ? statusToValue(results[2], "payment records", unavailable) : undefined;
  return formatManagementCatchUp(member, {
    overview, attention: member.role !== "marketing" ? secondary : undefined,
    marketing: member.role === "marketing" ? secondary : undefined,
    finance, unavailable
  }, period, now);
}
