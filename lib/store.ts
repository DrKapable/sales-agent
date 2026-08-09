import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { ConversationMessage, Lead, LeadPatch, Offer } from "@/lib/types";

type MemoryStore = {
  leads: Map<string, Lead>;
  messages: ConversationMessage[];
  offers: Map<string, Offer>;
};

const offerSeeds: Omit<Offer, "id" | "updatedAt">[] = [
  { slug: "pa-gym", name: "Pa Gym", category: "Learning", description: "Exam-focused clinical learning and revision support.", features: ["Structured revision", "Practice support", "Digital access"], priceZmw: null, paymentInstructions: null, active: false },
  { slug: "research-support", name: "Research Support", category: "Research", description: "Structured support for proposals, dissertations and manuscripts.", features: ["Project scoping", "Academic support", "Progress tracking"], priceZmw: null, paymentInstructions: null, active: false },
  { slug: "data-analysis", name: "Data Analysis", category: "Research", description: "Data cleaning, statistical analysis and results reporting.", features: ["Data cleaning", "Statistical analysis", "Results support"], priceZmw: null, paymentInstructions: null, active: false },
  { slug: "tutorials", name: "Tutorials and Courses", category: "Learning", description: "Focused tutorials matched to the learner's programme and goal.", features: ["Focused teaching", "Exam preparation", "Flexible learning"], priceZmw: null, paymentInstructions: null, active: false }
];

declare global {
  var __medmindsMemoryStore: MemoryStore | undefined;
}

function makeMemoryStore(): MemoryStore {
  const now = new Date().toISOString();
  return {
    leads: new Map(),
    messages: [],
    offers: new Map(offerSeeds.map((offer) => [offer.slug, { ...offer, id: crypto.randomUUID(), updatedAt: now }]))
  };
}

const memory = globalThis.__medmindsMemoryStore ?? makeMemoryStore();
globalThis.__medmindsMemoryStore = memory;

let sql: NeonQueryFunction<false, false> | null = null;
let initialization: Promise<void> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureDatabase() {
  const db = database();
  if (!db) return;
  initialization ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT, email TEXT, institution TEXT,
      programme TEXT, service_interest TEXT, deadline TEXT, package_name TEXT,
      status TEXT NOT NULL, handoff_reason TEXT, source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY, external_id TEXT UNIQUE, phone TEXT NOT NULL, role TEXT NOT NULL,
      content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS messages_phone_created_idx ON messages(phone, created_at DESC)`);
    await db.query(`CREATE TABLE IF NOT EXISTS offers (
      id UUID PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL, features JSONB NOT NULL DEFAULT '[]', price_zmw NUMERIC,
      payment_instructions TEXT, active BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    for (const offer of offerSeeds) {
      await db.query(
        `INSERT INTO offers (id, slug, name, category, description, features, price_zmw, payment_instructions, active)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) ON CONFLICT (slug) DO NOTHING`,
        [crypto.randomUUID(), offer.slug, offer.name, offer.category, offer.description, JSON.stringify(offer.features), offer.priceZmw, offer.paymentInstructions, offer.active]
      );
    }
  })();
  await initialization;
}

function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id), phone: String(row.phone), name: row.name ? String(row.name) : null,
    email: row.email ? String(row.email) : null, institution: row.institution ? String(row.institution) : null,
    programme: row.programme ? String(row.programme) : null,
    serviceInterest: row.service_interest ? String(row.service_interest) : null,
    deadline: row.deadline ? String(row.deadline) : null, packageName: row.package_name ? String(row.package_name) : null,
    status: String(row.status) as Lead["status"], handoffReason: row.handoff_reason ? String(row.handoff_reason) : null,
    source: String(row.source) as Lead["source"], createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapOffer(row: Record<string, unknown>): Offer {
  return {
    id: String(row.id), slug: String(row.slug), name: String(row.name), category: String(row.category),
    description: String(row.description), features: Array.isArray(row.features) ? row.features.map(String) : [],
    priceZmw: row.price_zmw === null ? null : Number(row.price_zmw),
    paymentInstructions: row.payment_instructions ? String(row.payment_instructions) : null,
    active: Boolean(row.active), updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function getOrCreateLead(phone: string, source: Lead["source"]): Promise<Lead> {
  await ensureDatabase();
  const db = database();
  if (!db) {
    const existing = memory.leads.get(phone);
    if (existing) return existing;
    const now = new Date().toISOString();
    const lead: Lead = { id: crypto.randomUUID(), phone, name: null, email: null, institution: null, programme: null, serviceInterest: null, deadline: null, packageName: null, status: "NEW LEAD", handoffReason: null, source, createdAt: now, updatedAt: now };
    memory.leads.set(phone, lead);
    return lead;
  }
  const rows = await db.query(`INSERT INTO leads (id, phone, status, source) VALUES ($1,$2,'NEW LEAD',$3)
    ON CONFLICT (phone) DO UPDATE SET updated_at = leads.updated_at RETURNING *`, [crypto.randomUUID(), phone, source]);
  return mapLead(rows[0] as Record<string, unknown>);
}

export async function updateLead(phone: string, patch: LeadPatch): Promise<Lead> {
  const lead = await getOrCreateLead(phone, "simulator");
  const updated = { ...lead, ...patch, updatedAt: new Date().toISOString() };
  const db = database();
  if (!db) {
    memory.leads.set(phone, updated);
    return updated;
  }
  const rows = await db.query(`UPDATE leads SET name=$2,email=$3,institution=$4,programme=$5,service_interest=$6,
    deadline=$7,package_name=$8,status=$9,handoff_reason=$10,updated_at=NOW() WHERE phone=$1 RETURNING *`,
    [phone, updated.name, updated.email, updated.institution, updated.programme, updated.serviceInterest, updated.deadline, updated.packageName, updated.status, updated.handoffReason]);
  return mapLead(rows[0] as Record<string, unknown>);
}

export async function addMessage(phone: string, role: ConversationMessage["role"], content: string, externalId: string | null = null) {
  await ensureDatabase();
  const message: ConversationMessage = { id: crypto.randomUUID(), externalId, phone, role, content, createdAt: new Date().toISOString() };
  const db = database();
  if (!db) {
    if (externalId && memory.messages.some((item) => item.externalId === externalId)) return false;
    memory.messages.push(message);
    return true;
  }
  const rows = await db.query(`INSERT INTO messages (id, external_id, phone, role, content) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (external_id) DO NOTHING RETURNING id`, [message.id, externalId, phone, role, content]);
  return rows.length > 0;
}

export async function getConversation(phone: string, limit = 14): Promise<ConversationMessage[]> {
  await ensureDatabase();
  const db = database();
  if (!db) return memory.messages.filter((item) => item.phone === phone).slice(-limit);
  const rows = await db.query(`SELECT * FROM messages WHERE phone=$1 ORDER BY created_at DESC LIMIT $2`, [phone, limit]);
  return rows.reverse().map((row) => ({ id: String(row.id), externalId: row.external_id ? String(row.external_id) : null, phone: String(row.phone), role: String(row.role) as ConversationMessage["role"], content: String(row.content), createdAt: new Date(String(row.created_at)).toISOString() }));
}

export async function listOffers(activeOnly = false): Promise<Offer[]> {
  await ensureDatabase();
  const db = database();
  if (!db) return [...memory.offers.values()].filter((offer) => !activeOnly || offer.active);
  const rows = await db.query(`SELECT * FROM offers ${activeOnly ? "WHERE active=TRUE" : ""} ORDER BY category,name`);
  return rows.map((row) => mapOffer(row as Record<string, unknown>));
}

export async function saveOffer(input: Omit<Offer, "id" | "updatedAt">): Promise<Offer> {
  await ensureDatabase();
  const db = database();
  if (!db) {
    const current = memory.offers.get(input.slug);
    const offer = { ...input, id: current?.id ?? crypto.randomUUID(), updatedAt: new Date().toISOString() };
    memory.offers.set(input.slug, offer);
    return offer;
  }
  const rows = await db.query(`INSERT INTO offers (id,slug,name,category,description,features,price_zmw,payment_instructions,active)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) ON CONFLICT (slug) DO UPDATE SET name=$3,category=$4,description=$5,
    features=$6::jsonb,price_zmw=$7,payment_instructions=$8,active=$9,updated_at=NOW() RETURNING *`,
    [crypto.randomUUID(), input.slug, input.name, input.category, input.description, JSON.stringify(input.features), input.priceZmw, input.paymentInstructions, input.active]);
  return mapOffer(rows[0] as Record<string, unknown>);
}

export async function listLeads(): Promise<Lead[]> {
  await ensureDatabase();
  const db = database();
  if (!db) return [...memory.leads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rows = await db.query(`SELECT * FROM leads ORDER BY updated_at DESC LIMIT 200`);
  return rows.map((row) => mapLead(row as Record<string, unknown>));
}

