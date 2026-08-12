import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getConversation, listLeads, listOffers } from "@/lib/store";
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
    await database.query(`CREATE TABLE IF NOT EXISTS business_tasks (
      id UUID PRIMARY KEY, lead_id UUID, title TEXT NOT NULL, assigned_to TEXT,
      due_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'OPEN', notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
    )`);
    await database.query(`CREATE TABLE IF NOT EXISTS client_payments (
      id UUID PRIMARY KEY, lead_id UUID, amount_zmw NUMERIC NOT NULL,
      reference TEXT, status TEXT NOT NULL DEFAULT 'PENDING', verified_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), verified_at TIMESTAMPTZ
    )`);
    await database.query(`CREATE TABLE IF NOT EXISTS sales_quotes (
      id UUID PRIMARY KEY, lead_id UUID, service TEXT NOT NULL, amount_zmw NUMERIC,
      details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await database.query(`CREATE TABLE IF NOT EXISTS client_feedback (
      id UUID PRIMARY KEY, lead_id UUID, rating INTEGER, comment TEXT,
      review_requested BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  })();
  await setup;
}

function ageDays(value: string) {
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 86400000);
}

export async function scoreLead(lead: Lead) {
  const messages = await getConversation(lead.phone, 30);
  const text = messages.map((m) => m.content.toLowerCase()).join(" ");
  let score = 20;
  if (lead.priority === "HOT") score += 25;
  else if (lead.priority === "WARM") score += 12;
  if (["INTERESTED", "PAYMENT PENDING"].includes(lead.status)) score += 25;
  if (lead.status === "QUALIFIED") score += 15;
  if (lead.deadline) score += 8;
  if (lead.serviceInterest || lead.packageName) score += 8;
  if (/pay|payment|proceed|start|how much|price|cost|subscribe|buy|quotation|quote/.test(text)) score += 15;
  if (/discount|expensive|too much|later|not sure|think about/.test(text)) score -= 8;
  if (lead.status === "LOST LEAD") score = 0;
  if (lead.status === "CONVERTED") score = 100;
  score = Math.max(0, Math.min(100, score));
  return { score, band: score >= 70 ? "HOT" : score >= 45 ? "WARM" : "COLD", messageCount: messages.length };
}

function inferLostReason(text: string) {
  const value = text.toLowerCase();
  if (/expensive|price|cost|too much|discount/.test(value)) return "Price/affordability";
  if (/later|not now|next month|wait/.test(value)) return "Timing/not ready";
  if (/another|elsewhere|competitor/.test(value)) return "Alternative provider";
  if (/trust|review|legit|scam|sure/.test(value)) return "Trust/credibility concern";
  if (/no reply|silent/.test(value)) return "No response";
  return "Reason not established";
}

export async function getBusinessSnapshot() {
  await ensureTables();
  const leads = await listLeads();
  const offers = await listOffers(true);
  const enriched = await Promise.all(leads.map(async (lead) => {
    const score = await scoreLead(lead);
    const history = await getConversation(lead.phone, 20);
    return {
      ...lead,
      leadScore: score.score,
      scoreBand: score.band,
      messageCount: score.messageCount,
      lostReason: lead.status === "LOST LEAD" ? inferLostReason(history.map((m) => m.content).join(" ")) : null,
      lastMessage: history.at(-1)?.content ?? null,
      ageDays: Math.round(ageDays(lead.createdAt))
    };
  }));

  const converted = enriched.filter((lead) => lead.status === "CONVERTED");
  const lost = enriched.filter((lead) => lead.status === "LOST LEAD");
  const serviceCounts = new Map<string, { leads: number; converted: number }>();
  for (const lead of enriched) {
    const service = lead.serviceInterest || lead.packageName || "Not established";
    const row = serviceCounts.get(service) ?? { leads: 0, converted: 0 };
    row.leads += 1;
    if (lead.status === "CONVERTED") row.converted += 1;
    serviceCounts.set(service, row);
  }

  const database = db();
  let tasks: any[] = [], payments: any[] = [], quotes: any[] = [], feedback: any[] = [];
  if (database) {
    [tasks, payments, quotes, feedback] = await Promise.all([
      database.query(`SELECT * FROM business_tasks ORDER BY created_at DESC LIMIT 100`),
      database.query(`SELECT * FROM client_payments ORDER BY created_at DESC LIMIT 100`),
      database.query(`SELECT * FROM sales_quotes ORDER BY created_at DESC LIMIT 100`),
      database.query(`SELECT * FROM client_feedback ORDER BY created_at DESC LIMIT 100`)
    ]);
  }

  return {
    metrics: {
      totalLeads: enriched.length,
      converted: converted.length,
      lost: lost.length,
      conversionRate: enriched.length ? Math.round((converted.length / enriched.length) * 100) : 0,
      hotLeads: enriched.filter((lead) => lead.scoreBand === "HOT" && lead.status !== "CONVERTED").length,
      followUpsDue: enriched.filter((lead) => lead.followUpAt && new Date(lead.followUpAt).getTime() <= Date.now() && !["CONVERTED", "LOST LEAD"].includes(lead.status)).length,
      paymentPending: enriched.filter((lead) => lead.status === "PAYMENT PENDING").length
    },
    leads: enriched.sort((a, b) => b.leadScore - a.leadScore),
    services: [...serviceCounts.entries()].map(([service, values]) => ({ service, ...values, conversionRate: values.leads ? Math.round(values.converted / values.leads * 100) : 0 })).sort((a, b) => b.leads - a.leads),
    lostReasons: [...new Map(lost.map((lead) => [lead.lostReason || "Reason not established", 0])).keys()].map((reason) => ({ reason, count: lost.filter((lead) => lead.lostReason === reason).length })).sort((a, b) => b.count - a.count),
    offers: offers.map((offer) => ({ slug: offer.slug, name: offer.name, category: offer.category, priceZmw: offer.priceZmw, rushPriceZmw: offer.rushPriceZmw })),
    tasks,
    payments,
    quotes,
    feedback
  };
}

export async function createBusinessTask(input: { leadId?: string; title: string; assignedTo?: string; dueAt?: string; notes?: string }) {
  await ensureTables();
  const database = db();
  if (!database) throw new Error("Persistent database storage is required.");
  const rows = await database.query(`INSERT INTO business_tasks (id,lead_id,title,assigned_to,due_at,notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [crypto.randomUUID(), input.leadId || null, input.title, input.assignedTo || null, input.dueAt || null, input.notes || null]);
  return rows[0];
}

export async function recordPayment(input: { leadId: string; amountZmw: number; reference?: string; verified?: boolean; verifiedBy?: string }) {
  await ensureTables();
  const database = db();
  if (!database) throw new Error("Persistent database storage is required.");
  const rows = await database.query(`INSERT INTO client_payments (id,lead_id,amount_zmw,reference,status,verified_by,verified_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [crypto.randomUUID(), input.leadId, input.amountZmw, input.reference || null, input.verified ? "VERIFIED" : "PENDING", input.verified ? (input.verifiedBy || "Admin") : null, input.verified ? new Date().toISOString() : null]);
  return rows[0];
}

export async function createQuote(input: { leadId: string; service: string; amountZmw?: number; details: string }) {
  await ensureTables();
  const database = db();
  if (!database) throw new Error("Persistent database storage is required.");
  const rows = await database.query(`INSERT INTO sales_quotes (id,lead_id,service,amount_zmw,details) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [crypto.randomUUID(), input.leadId, input.service, input.amountZmw ?? null, input.details]);
  return rows[0];
}

export async function recordFeedback(input: { leadId: string; rating?: number; comment?: string; reviewRequested?: boolean }) {
  await ensureTables();
  const database = db();
  if (!database) throw new Error("Persistent database storage is required.");
  const rows = await database.query(`INSERT INTO client_feedback (id,lead_id,rating,comment,review_requested) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [crypto.randomUUID(), input.leadId, input.rating ?? null, input.comment || null, Boolean(input.reviewRequested)]);
  return rows[0];
}
