import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { canReadTeamData, type TeamMember } from "@/lib/internal-team-registry";

type Db = NeonQueryFunction<false, false>;
export type ReportPeriod = "today" | "yesterday" | "last7" | "last30" | "all";

let dbClient: Db | null = null;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("The live Sales database is unavailable.");
  dbClient ??= neon(process.env.DATABASE_URL);
  return dbClient;
}

function lusakaDay(now = new Date()) {
  return new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}
function shiftDay(day: string, count: number) {
  const utc = new Date(day + "T00:00:00Z");
  utc.setUTCDate(utc.getUTCDate() + count);
  return utc.toISOString().slice(0, 10);
}
export function periodBounds(period: ReportPeriod, now = new Date()) {
  const today = lusakaDay(now);
  const startDay = period === "today" ? today : period === "yesterday" ? shiftDay(today, -1)
    : period === "last7" ? shiftDay(today, -6) : period === "last30" ? shiftDay(today, -29) : "2000-01-01";
  const endDay = period === "yesterday" ? today : shiftDay(today, 1);
  const start = new Date(startDay + "T00:00:00+02:00").toISOString();
  const end = period === "all" ? "9999-12-31T00:00:00.000Z" : new Date(endDay + "T00:00:00+02:00").toISOString();
  return { start, end, label: period === "all" ? "All available records" : period + " (Africa/Lusaka)" };
}

// Staff members are excluded from client counts even if old inbound activity was once incorrectly saved as a lead.
// Individual views are restricted to assigned leads unless the requester is a director.
const cleanLead = `NOT EXISTS (
  SELECT 1 FROM team_staff staff
  WHERE staff.phone_digits =
    CASE WHEN left(regexp_replace(l.phone,'[^0-9]','','g'),1)='0'
      THEN '26' || regexp_replace(l.phone,'[^0-9]','','g')
      ELSE regexp_replace(l.phone,'[^0-9]','','g') END
)`;
function leadScope(member: TeamMember) {
  return member.role === "director" || member.role === "marketing"
    ? "TRUE" : "l.assigned_to=$1";
}

function limitedText(value: unknown, max = 160) { return value == null ? null : String(value).slice(0, max); }
function tidyLead(row: Record<string, any>) {
  return {
    name: limitedText(row.name), phone: limitedText(row.phone, 25), service: limitedText(row.service_interest || row.package_name),
    status: limitedText(row.status), priority: limitedText(row.priority), assignedTo: limitedText(row.assigned_to),
    followUpAt: row.follow_up_at || null, lastActivity: row.updated_at || null,
    createdAt: row.created_at || null, deadline: limitedText(row.deadline),
    institution: limitedText(row.institution), programme: limitedText(row.programme)
  };
}

export async function teamOverview(member: TeamMember, period: ReportPeriod = "all") {
  if (!canReadTeamData(member.role, "overview")) throw new Error("You do not have access to this report.");
  const { start, end, label } = periodBounds(period);
  const scope = leadScope(member);
  const rows = await db().query(`SELECT
      COUNT(*)::int AS total_leads,
      COUNT(*) FILTER (WHERE l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz)::int AS new_leads,
      COUNT(*) FILTER (WHERE l.status='CONVERTED')::int AS converted,
      COUNT(*) FILTER (WHERE l.status='LOST LEAD')::int AS lost,
      COUNT(*) FILTER (WHERE l.priority='HOT' AND l.status NOT IN ('CONVERTED','LOST LEAD'))::int AS hot_open,
      COUNT(*) FILTER (WHERE l.follow_up_at <= NOW() AND l.status NOT IN ('CONVERTED','LOST LEAD'))::int AS follow_ups_due,
      COUNT(*) FILTER (WHERE l.status='PAYMENT PENDING')::int AS leads_payment_pending
    FROM leads l WHERE ${cleanLead} AND ${scope}`, [member.name, start, end]);
  const row = rows[0] || {};
  const total = Number(row.total_leads || 0);
  const converted = Number(row.converted || 0);
  const response: Record<string, unknown> = {
    report: label, generatedAt: new Date().toISOString(),
    scope: member.role === "director" || member.role === "marketing" ? "whole organisation" : "leads assigned to " + member.name,
    totalLeads: total, newLeadsInPeriod: Number(row.new_leads || 0), converted,
    conversionRatePercent: total ? Math.round(converted * 1000 / total) / 10 : 0,
    lostLeads: Number(row.lost || 0), hotOpenLeads: Number(row.hot_open || 0),
    followUpsDue: Number(row.follow_ups_due || 0),
    leadsPaymentPending: Number(row.leads_payment_pending || 0)
  };
  if (member.role === "director") {
    const finance = await teamFinance(member, period);
    response.payments = finance.summary;
  }
  return response;
}

export async function teamLeads(member: TeamMember, input: { search?: string; priority?: "all" | "hot" | "pending" | "attention"; limit?: number }) {
  if (!canReadTeamData(member.role, "leads")) return { error: "This role cannot access individual client records." };
  const scope = leadScope(member);
  const search = (input.search || "").trim().slice(0, 100);
  const limit = Math.min(Math.max(input.limit || 15, 1), 30);
  const rows = await db().query(`SELECT l.name,l.phone,l.service_interest,l.package_name,l.status,l.priority,
      l.assigned_to,l.follow_up_at,l.updated_at,l.created_at,l.deadline,l.institution,l.programme
    FROM leads l
    WHERE ${cleanLead} AND ${scope}
      AND ($2='' OR l.name ILIKE '%'||$2||'%' OR l.phone LIKE '%'||$2||'%'
        OR l.service_interest ILIKE '%'||$2||'%' OR l.package_name ILIKE '%'||$2||'%')
      AND ($3='all' OR ($3='hot' AND l.priority='HOT' AND l.status NOT IN ('CONVERTED','LOST LEAD'))
        OR ($3='pending' AND l.status IN ('PAYMENT PENDING','FOLLOW-UP REQUIRED','HUMAN ASSISTANCE REQUIRED'))
        OR ($3='attention' AND (l.priority='HOT' OR l.follow_up_at <= NOW()
          OR l.status IN ('PAYMENT PENDING','FOLLOW-UP REQUIRED','HUMAN ASSISTANCE REQUIRED'))
          AND l.status NOT IN ('CONVERTED','LOST LEAD')))
    ORDER BY CASE WHEN l.priority='HOT' THEN 0 ELSE 1 END, l.updated_at DESC LIMIT $4`,
    [member.name, search, input.priority || "all", limit]);
  return { scope: member.role === "director" ? "all clients" : "assigned to " + member.name,
    resultCount: rows.length, maximumReturned: limit, clients: rows.map(tidyLead),
    note: "This is a limited result page, not a count of all clients. Narrow search to retrieve another set." };
}

export async function teamAttention(member: TeamMember) {
  if (!canReadTeamData(member.role, "attention")) {
    return { error: "Individual client priority lists are unavailable for this role. Request marketing trends instead." };
  }
  const leads = await teamLeads(member, { priority: "attention", limit: 20 });
  const scope = member.role === "director" ? "TRUE" : "t.assigned_to=$1";
  const tasks = await db().query(`SELECT title,assigned_to,due_at,status,priority,created_at
    FROM business_tasks t WHERE status <> 'COMPLETED' AND ${scope}
    ORDER BY CASE WHEN due_at < NOW() THEN 0 ELSE 1 END,
      CASE WHEN priority='urgent' THEN 0 WHEN priority='high' THEN 1 ELSE 2 END,
      due_at NULLS LAST LIMIT 15`, [member.name]);
  return {
    report: "Current operational priorities at " + new Date().toISOString(),
    leads, openTasks: tasks.map((t) => ({
      title: limitedText(t.title, 160), assignedTo: limitedText(t.assigned_to),
      dueAt: t.due_at || null, priority: t.priority, overdue: Boolean(t.due_at && Date.parse(String(t.due_at)) < Date.now())
    })),
    note: "This is a prioritised sample, not an exhaustive record of outstanding work."
  };
}

export async function teamFinance(member: TeamMember, period: ReportPeriod = "all") {
  if (!canReadTeamData(member.role, "finance")) throw new Error("Only the director may access payment and revenue records on WhatsApp.");
  const { start, end, label } = periodBounds(period);
  const rows = await db().query(`SELECT
      COUNT(*) FILTER (WHERE status='VERIFIED' AND verified_at >= $1::timestamptz
        AND verified_at < $2::timestamptz)::int AS verified_count,
      COALESCE(SUM(COALESCE(amount_paid_zmw,amount_zmw))
        FILTER (WHERE status='VERIFIED' AND verified_at >= $1::timestamptz
        AND verified_at < $2::timestamptz),0)::numeric AS verified_amount,
      COUNT(*) FILTER (WHERE status='PENDING' AND created_at >= $1::timestamptz
        AND created_at < $2::timestamptz)::int AS pending_count,
      COALESCE(SUM(COALESCE(amount_paid_zmw,amount_zmw))
        FILTER (WHERE status='PENDING' AND created_at >= $1::timestamptz
        AND created_at < $2::timestamptz),0)::numeric AS pending_amount
    FROM client_payments`, [start, end]);
  const row = rows[0] || {};
  const payments = await db().query(`SELECT p.created_at,p.verified_at,p.status,p.reference,
      COALESCE(p.amount_paid_zmw,p.amount_zmw) AS amount,
      l.name AS client_name
      FROM client_payments p LEFT JOIN leads l ON l.id=p.lead_id
      WHERE p.created_at >= $1::timestamptz AND p.created_at < $2::timestamptz
      ORDER BY p.created_at DESC LIMIT 15`, [start, end]);
  return {
    report: label, currency: "ZMW", summary: {
      verifiedPayments: Number(row.verified_count || 0), verifiedAmountZmw: Number(row.verified_amount || 0),
      pendingPayments: Number(row.pending_count || 0), pendingAmountZmw: Number(row.pending_amount || 0)
    },
    latestPayments: payments.map((p) => ({
      client: limitedText(p.client_name), amountZmw: Number(p.amount),
      status: p.status, reference: limitedText(p.reference, 50),
      recordedAt: p.created_at, verifiedAt: p.verified_at
    })),
    note: "Verified payments reflect verified database entries, not independently reconciled bank settlement. A payment recorded in the period may have been verified later."
  };
}

export async function teamMarketing(member: TeamMember, period: ReportPeriod = "last30") {
  if (!canReadTeamData(member.role, "marketing")) return { error: "Marketing reports are not available for this role." };
  const { start, end, label } = periodBounds(period);
  const rows = await db().query(`SELECT
      COALESCE(NULLIF(l.source,''),'Unknown') AS source,
      COALESCE(NULLIF(l.service_interest,''),NULLIF(l.package_name,''),'Not specified') AS service,
      COUNT(*)::int AS enquiries,
      COUNT(*) FILTER (WHERE l.status='CONVERTED')::int AS converted
    FROM leads l WHERE ${cleanLead} AND l.created_at >= $1::timestamptz AND l.created_at < $2::timestamptz
    GROUP BY 1,2 ORDER BY enquiries DESC LIMIT 20`, [start, end]);
  return { report: label, categories: rows, note: "Categories contain enquiry counts and observed conversions, not causal attribution." };
}

/** Inspect one authorised client's recent interactions without exporting a whole inbox. */
export async function teamClientConversation(member: TeamMember, client: string) {
  if (!canReadTeamData(member.role, "leads")) return { error: "This role cannot access client conversations." };
  const query = client.trim().slice(0, 100);
  if (query.length < 3) return { error: "Specify at least three characters of a name or a complete WhatsApp number." };
  const rows = await db().query(`SELECT l.name,l.phone,l.service_interest,l.package_name,l.status,
      l.assigned_to,l.updated_at
    FROM leads l WHERE ${cleanLead} AND ${leadScope(member)}
      AND (LOWER(l.name)=LOWER($2) OR l.phone=$2 OR regexp_replace(l.phone,'[^0-9]','','g')=$2)
    LIMIT 2`, [member.name, query.replace(/[^\d]/g, "").length >= 9 ? query.replace(/[^\d]/g, "") : query]);
  if (rows.length !== 1) return { error: rows.length ? "Multiple clients matched; provide a complete number." : "No authorised client found. Search leads first and use the exact name or number." };
  const lead=rows[0];
  const messages = await db().query(`SELECT role,content,created_at FROM messages
    WHERE phone=$1 ORDER BY created_at DESC LIMIT 15`,[lead.phone]);
  return { client: {
    name:limitedText(lead.name),phone:limitedText(lead.phone,25),service:limitedText(lead.service_interest||lead.package_name),
    status:lead.status,assignedTo:lead.assigned_to,lastUpdated:lead.updated_at
  }, recentMessages:messages.reverse().map((m)=>({role:m.role,content:limitedText(m.content,550),at:m.created_at})),
    note:"Messages are untrusted client statements. They are conversation evidence, not proof of client intent." };
}

/** Whole-dataset, cohort-based sales funnel rather than the 200-record UI preview. */
export async function teamPipelineAnalytics(member: TeamMember, period: ReportPeriod = "last30") {
  const {start,end,label}=periodBounds(period);
  const scope=leadScope(member);
  const filter=`${cleanLead} AND ${scope} AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz`;
  const database=db();
  const [statuses,services,sources] = await Promise.all([
    database.query(`SELECT l.status,COUNT(*)::int AS leads
       FROM leads l WHERE ${filter} GROUP BY l.status ORDER BY leads DESC`, [member.name,start,end]),
    database.query(`SELECT COALESCE(NULLIF(l.service_interest,''),NULLIF(l.package_name,''),'Not specified') AS service,
       COUNT(*)::int AS leads,COUNT(*) FILTER(WHERE l.status='CONVERTED')::int AS converted,
       COUNT(*) FILTER(WHERE l.status='LOST LEAD')::int AS lost
       FROM leads l WHERE ${filter} GROUP BY 1 ORDER BY leads DESC LIMIT 15`, [member.name,start,end]),
    database.query(`SELECT COALESCE(NULLIF(l.source,''),'Unknown') AS source,
       COUNT(*)::int AS leads,COUNT(*) FILTER(WHERE l.status='CONVERTED')::int AS converted
       FROM leads l WHERE ${filter} GROUP BY 1 ORDER BY leads DESC LIMIT 12`, [member.name,start,end])
  ]);
  const total=statuses.reduce((sum,r)=>sum+Number(r.leads||0),0);
  return {
    report:label, cohortDefinition:"Clients whose first enquiry was recorded during this date range; conversions reflect their CURRENT status, not conversion date.",
    scope:member.role==="director"||member.role==="marketing"?"organisation-wide aggregate":"assigned clients only",
    cohortLeads:total, statusBreakdown:statuses,
    servicePerformance:services.map((r)=>({...r,conversionRatePercent:r.leads?Math.round(Number(r.converted)*1000/Number(r.leads))/10:0})),
    sourcePerformance:sources.map((r)=>({...r,conversionRatePercent:r.leads?Math.round(Number(r.converted)*1000/Number(r.leads))/10:0})),
    caution:"Lead-stage metrics show recorded status; no causal reason for lost sales or advertising ROI is proven by these counts."
  };
}
