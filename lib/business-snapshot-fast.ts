import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getConversation, listLeads, listOffers } from "@/lib/store";
import { managementCategoryForOffer, precisePercentage, serviceCategoryForLead, summarizeServiceCategories } from "@/lib/service-categories";
import type { Lead } from "@/lib/types";

let sql: NeonQueryFunction<false, false> | null = null;
let setup: Promise<void> | null = null;

function db() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureTables() {
  const database = db();
  if (!database) return;
  setup ??= (async () => {
    await database.query(`CREATE TABLE IF NOT EXISTS business_tasks (id UUID PRIMARY KEY, lead_id UUID, title TEXT NOT NULL, assigned_to TEXT, due_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'OPEN', notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ)`);
    await database.query(`ALTER TABLE business_tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'standard'`);
    await database.query(`ALTER TABLE business_tasks ADD COLUMN IF NOT EXISTS source TEXT`);
    await database.query(`ALTER TABLE business_tasks ADD COLUMN IF NOT EXISTS external_id TEXT`);
    await database.query(`ALTER TABLE business_tasks ADD COLUMN IF NOT EXISTS program TEXT`);
    await database.query(`ALTER TABLE business_tasks ADD COLUMN IF NOT EXISTS academic_level TEXT`);
    await database.query(`ALTER TABLE business_tasks ADD COLUMN IF NOT EXISTS source_client TEXT`);
    await database.query(`CREATE UNIQUE INDEX IF NOT EXISTS business_tasks_source_external_id_uidx ON business_tasks(source, external_id)`);
    await database.query(`CREATE TABLE IF NOT EXISTS client_payments (id UUID PRIMARY KEY, lead_id UUID, amount_zmw NUMERIC NOT NULL, reference TEXT, status TEXT NOT NULL DEFAULT 'PENDING', verified_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), verified_at TIMESTAMPTZ)`);
    await database.query(`CREATE TABLE IF NOT EXISTS sales_quotes (id UUID PRIMARY KEY, lead_id UUID, service TEXT NOT NULL, amount_zmw NUMERIC, details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await database.query(`CREATE TABLE IF NOT EXISTS client_feedback (id UUID PRIMARY KEY, lead_id UUID, rating INTEGER, comment TEXT, review_requested BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  })();
  await setup;
}

function ageDays(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 86400000) : 0;
}

function scoreLead(lead: Lead, text: string, messageCount: number) {
  const value = text.toLowerCase();
  let score = 20;
  if (lead.priority === "HOT") score += 25;
  else if (lead.priority === "WARM") score += 12;
  if (["INTERESTED", "PAYMENT PENDING"].includes(lead.status)) score += 25;
  if (lead.status === "QUALIFIED") score += 15;
  if (lead.deadline) score += 8;
  if (lead.serviceInterest || lead.packageName) score += 8;
  if (/pay|payment|proceed|start|how much|price|cost|subscribe|buy|quotation|quote/.test(value)) score += 15;
  if (/discount|expensive|too much|later|not sure|think about/.test(value)) score -= 8;
  if (lead.status === "LOST LEAD") score = 0;
  if (lead.status === "CONVERTED") score = 100;
  score = Math.max(0, Math.min(100, score));
  return { score, band: score >= 70 ? "HOT" : score >= 45 ? "WARM" : "COLD", messageCount };
}

function inferLostReason(text: string) {
  const value = text.toLowerCase();
  if (/expensive|price|cost|too much|discount/.test(value)) return "Price/affordability";
  if (/later|not now|next month|wait/.test(value)) return "Timing/not ready";
  if (/another|elsewhere|competitor/.test(value)) return "Alternative provider";
  if (/trust|review|legit|scam|sure/.test(value)) return "Trust/credibility concern";
  return "Reason not established";
}

type Summary = { messageCount: number; recentText: string; lastMessage: string | null; lastActivityAt: string | null };

async function batchMessageSummaries(database: NeonQueryFunction<false, false>) {
  const rows = await database.query(`
    WITH recent_leads AS (SELECT phone FROM leads ORDER BY updated_at DESC LIMIT 200),
    ranked AS (
      SELECT m.phone,m.content,m.created_at,
             ROW_NUMBER() OVER (PARTITION BY m.phone ORDER BY m.created_at DESC) AS rn
      FROM messages m
      INNER JOIN recent_leads l ON l.phone=m.phone
    )
    SELECT phone,COUNT(*)::int AS message_count,
           STRING_AGG(content,' ' ORDER BY created_at) AS recent_text,
           MAX(created_at) AS last_activity_at,
           (ARRAY_AGG(content ORDER BY created_at DESC))[1] AS last_message
    FROM ranked WHERE rn<=30 GROUP BY phone
  `);
  return new Map<string, Summary>(rows.map((row: any) => [String(row.phone), {
    messageCount: Number(row.message_count || 0),
    recentText: String(row.recent_text || ""),
    lastMessage: row.last_message ? String(row.last_message) : null,
    lastActivityAt: row.last_activity_at ? new Date(String(row.last_activity_at)).toISOString() : null
  }]));
}

export async function getFastBusinessSnapshot() {
  await ensureTables();
  const database = db();
  const [leads, offers] = await Promise.all([listLeads(), listOffers(true)]);
  let tasks: any[] = [], payments: any[] = [], quotes: any[] = [], feedback: any[] = [];
  let summaries = new Map<string, Summary>();

  if (database) {
    const [taskRows, paymentRows, quoteRows, feedbackRows, messageRows] = await Promise.all([
      database.query(`SELECT * FROM business_tasks ORDER BY created_at DESC LIMIT 150`),
      database.query(`SELECT * FROM client_payments ORDER BY created_at DESC LIMIT 150`),
      database.query(`SELECT * FROM sales_quotes ORDER BY created_at DESC LIMIT 150`),
      database.query(`SELECT * FROM client_feedback ORDER BY created_at DESC LIMIT 150`),
      batchMessageSummaries(database)
    ]);
    tasks = taskRows; payments = paymentRows; quotes = quoteRows; feedback = feedbackRows; summaries = messageRows;
  } else {
    summaries = new Map(await Promise.all(leads.map(async (lead) => {
      const history = await getConversation(lead.phone, 30);
      const latest = history.at(-1);
      return [lead.phone, { messageCount: history.length, recentText: history.map((m) => m.content).join(" "), lastMessage: latest?.content ?? null, lastActivityAt: latest?.createdAt ?? null } as Summary] as const;
    })));
  }

  const enriched = leads.map((lead) => {
    const summary = summaries.get(lead.phone) || { messageCount: 0, recentText: "", lastMessage: null, lastActivityAt: null };
    const scored = scoreLead(lead, summary.recentText, summary.messageCount);
    const lastActivityAt = summary.lastActivityAt || lead.createdAt;
    const serviceCategory = serviceCategoryForLead(lead, offers);
    return { ...lead, serviceCategory, leadScore: scored.score, scoreBand: scored.band, messageCount: scored.messageCount, lostReason: lead.status === "LOST LEAD" ? inferLostReason(summary.recentText) : null, lastMessage: summary.lastMessage, lastActivityAt, ageDays: Math.round(ageDays(lead.createdAt)), inactiveDays: Math.round(ageDays(lastActivityAt)) };
  });

  const converted = enriched.filter((lead) => lead.status === "CONVERTED");
  const lost = enriched.filter((lead) => lead.status === "LOST LEAD");
  // The Business Intelligence service card is an enquiry-mix view. Its badge therefore
  // shows each service category's share of all enquiries, while the observed conversion
  // rate is retained separately for analytics and other consumers.
  const services = summarizeServiceCategories(enriched, offers).map((row) => ({
    ...row,
    observedConversionRate: row.conversionRate,
    conversionRate: row.leadShare
  }));

  const leadMap = new Map(enriched.map((lead) => [lead.id, lead]));
  const attachLead = (row: any) => {
    const lead = row.lead_id ? leadMap.get(row.lead_id) : null;
    return { ...row, leadName: lead?.name || null, leadPhone: lead?.phone || null, serviceInterest: lead?.serviceInterest || lead?.packageName || null, serviceCategory: lead?.serviceCategory || "Others" };
  };
  tasks = tasks.map(attachLead); payments = payments.map(attachLead); quotes = quotes.map(attachLead); feedback = feedback.map(attachLead);

  const dueFollowUps = enriched.filter((lead) => lead.followUpAt && new Date(lead.followUpAt).getTime() <= Date.now() && !["CONVERTED", "LOST LEAD"].includes(lead.status));
  const pendingPayments = payments.filter((payment) => payment.status === "PENDING");
  const openTasks = tasks.filter((task) => task.status !== "COMPLETED");
  const overdueTasks = openTasks.filter((task) => task.due_at && new Date(task.due_at).getTime() < Date.now());
  const staleWarmLeads = enriched.filter((lead) => !["CONVERTED", "LOST LEAD"].includes(lead.status) && lead.inactiveDays >= 3 && lead.leadScore >= 45);

  return {
    generatedAt: new Date().toISOString(),
    metrics: { totalLeads: enriched.length, converted: converted.length, lost: lost.length, conversionRate: precisePercentage(converted.length, enriched.length), hotLeads: enriched.filter((lead) => lead.scoreBand === "HOT" && !["CONVERTED", "LOST LEAD"].includes(lead.status)).length, followUpsDue: dueFollowUps.length, paymentPending: pendingPayments.length, paymentPendingLeads: enriched.filter((lead) => lead.status === "PAYMENT PENDING").length, openTasks: openTasks.length, overdueTasks: overdueTasks.length, quotesCreated: quotes.length, staleWarmLeads: staleWarmLeads.length },
    leads: enriched.sort((a, b) => b.leadScore - a.leadScore || new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()),
    services,
    lostReasons: [...new Set(lost.map((lead) => lead.lostReason || "Reason not established"))].map((reason) => ({ reason, count: lost.filter((lead) => lead.lostReason === reason).length })).sort((a, b) => b.count - a.count),
    offers: offers.map((offer) => ({ slug: offer.slug, name: offer.name, category: managementCategoryForOffer(offer), catalogueCategory: offer.category, priceZmw: offer.priceZmw, rushPriceZmw: offer.rushPriceZmw })),
    tasks, payments, quotes, feedback,
    attention: { followUpsDue: dueFollowUps.slice(0, 12), overdueTasks: overdueTasks.slice(0, 12), staleWarmLeads: staleWarmLeads.slice(0, 12) }
  };
}
