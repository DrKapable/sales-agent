import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { offerSeeds } from "@/lib/catalogue";
import type { ConversationMessage, Lead, LeadPatch, Offer } from "@/lib/types";

type MemoryStore = {
  leads: Map<string, Lead>;
  messages: ConversationMessage[];
  offers: Map<string, Offer>;
};

const CATALOGUE_VERSION = 2;

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
      status TEXT NOT NULL, handoff_reason TEXT, ai_paused BOOLEAN NOT NULL DEFAULT FALSE,
      assigned_to TEXT, internal_note TEXT, priority TEXT NOT NULL DEFAULT 'STANDARD',
      follow_up_at TIMESTAMPTZ, source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to TEXT`);
    await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS internal_note TEXT`);
    await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'STANDARD'`);
    await db.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ`);
    await db.query(`CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY, external_id TEXT UNIQUE, phone TEXT NOT NULL, role TEXT NOT NULL,
      content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS messages_phone_created_idx ON messages(phone, created_at DESC)`);
    await db.query(`UPDATE leads SET source='whatsapp'
      WHERE source='simulator' AND EXISTS (
        SELECT 1 FROM messages
        WHERE messages.phone=leads.phone AND messages.external_id LIKE 'wamid.%'
      )`);
    await db.query(`CREATE TABLE IF NOT EXISTS offers (
      id UUID PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL, features JSONB NOT NULL DEFAULT '[]', price_zmw NUMERIC,
      rush_price_zmw NUMERIC, payment_instructions TEXT, active BOOLEAN NOT NULL DEFAULT FALSE,
      catalogue_version INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS rush_price_zmw NUMERIC`);
    await db.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS catalogue_version INTEGER NOT NULL DEFAULT 0`);
    for (const offer of offerSeeds) {
      await db.query(
        `INSERT INTO offers (id, slug, name, category, description, features, price_zmw, rush_price_zmw, payment_instructions, active, catalogue_version)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)
         ON CONFLICT (slug) DO UPDATE SET name=$3,category=$4,description=$5,features=$6::jsonb,
         price_zmw=$7,rush_price_zmw=$8,payment_instructions=$9,active=$10,catalogue_version=$11,updated_at=NOW()
         WHERE offers.catalogue_version < $11`,
        [crypto.randomUUID(), offer.slug, offer.name, offer.category, offer.description, JSON.stringify(offer.features), offer.priceZmw, offer.rushPriceZmw, offer.paymentInstructions, offer.active, CATALOGUE_VERSION]
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
    aiPaused: Boolean(row.ai_paused), assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    internalNote: row.internal_note ? String(row.internal_note) : null,
    priority: (row.priority ? String(row.priority) : "STANDARD") as Lead["priority"],
    followUpAt: row.follow_up_at ? new Date(String(row.follow_up_at)).toISOString() : null,
    source: String(row.source) as Lead["source"], createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapOffer(row: Record<string, unknown>): Offer {
  return {
    id: String(row.id), slug: String(row.slug), name: String(row.name), category: String(row.category),
    description: String(row.description), features: Array.isArray(row.features) ? row.features.map(String) : [],
    priceZmw: row.price_zmw === null ? null : Number(row.price_zmw),
    rushPriceZmw: row.rush_price_zmw === null ? null : Number(row.rush_price_zmw),
    paymentInstructions: row.payment_instructions ? String(row.payment_instructions) : null,
    active: Boolean(row.active), updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function getOrCreateLead(phone: string, source: Lead["source"]): Promise<Lead> {
  await ensureDatabase();
  const db = database();
  if (!db) {
    const existing = memory.leads.get(phone);
    if (existing) {
      if (source === "whatsapp" && existing.source !== "whatsapp") {
        const promoted = { ...existing, source: "whatsapp" as const };
        memory.leads.set(phone, promoted);
        return promoted;
      }
      return existing;
    }
    const now = new Date().toISOString();
    const lead: Lead = { id: crypto.randomUUID(), phone, name: null, email: null, institution: null, programme: null, serviceInterest: null, deadline: null, packageName: null, status: "NEW LEAD", handoffReason: null, aiPaused: false, assignedTo: null, internalNote: null, priority: "STANDARD", followUpAt: null, source, createdAt: now, updatedAt: now };
    memory.leads.set(phone, lead);
    return lead;
  }
  const rows = await db.query(`INSERT INTO leads (id, phone, status, source) VALUES ($1,$2,'NEW LEAD',$3)
    ON CONFLICT (phone) DO UPDATE SET
      source = CASE WHEN EXCLUDED.source='whatsapp' THEN 'whatsapp' ELSE leads.source END,
      updated_at = leads.updated_at
    RETURNING *`, [crypto.randomUUID(), phone, source]);
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
    deadline=$7,package_name=$8,status=$9,handoff_reason=$10,ai_paused=$11,assigned_to=$12,internal_note=$13,
    priority=$14,follow_up_at=$15,updated_at=NOW() WHERE phone=$1 RETURNING *`,
    [phone, updated.name, updated.email, updated.institution, updated.programme, updated.serviceInterest, updated.deadline, updated.packageName, updated.status, updated.handoffReason, updated.aiPaused, updated.assignedTo, updated.internalNote, updated.priority, updated.followUpAt]);
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
  const rows = await db.query(`INSERT INTO offers (id,slug,name,category,description,features,price_zmw,rush_price_zmw,payment_instructions,active)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) ON CONFLICT (slug) DO UPDATE SET name=$3,category=$4,description=$5,
    features=$6::jsonb,price_zmw=$7,rush_price_zmw=$8,payment_instructions=$9,active=$10,updated_at=NOW() RETURNING *`,
    [crypto.randomUUID(), input.slug, input.name, input.category, input.description, JSON.stringify(input.features), input.priceZmw, input.rushPriceZmw, input.paymentInstructions, input.active]);
  return mapOffer(rows[0] as Record<string, unknown>);
}

export async function listLeads(): Promise<Lead[]> {
  await ensureDatabase();
  const db = database();
  if (!db) return [...memory.leads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rows = await db.query(`SELECT * FROM leads ORDER BY updated_at DESC LIMIT 200`);
  return rows.map((row) => mapLead(row as Record<string, unknown>));
}
