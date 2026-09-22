import { neon } from "@neondatabase/serverless";
import { addMessage, getOrCreateLead, listLeads, updateLead } from "@/lib/store";

const EXPLEE_BASE_URL = "https://api.explee.com";
const DEFAULT_PROJECT_ID = 39070;
const PAGE_SIZE = 200;
const MAX_PAGES = 50;
const INITIAL_LOOKBACK_MS = 15 * 60 * 1000;

type ExpleeCampaign = {
  id: number;
  project_id: number;
  name?: string | null;
  status: string;
};

type CampaignListResponse = {
  campaigns: ExpleeCampaign[];
  total: number;
};

type ExpleeHotLead = {
  person_id: string;
  campaign_id: number;
  name?: string | null;
  email?: string | null;
  job_title?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
  linkedin_url?: string | null;
  country?: string | null;
  phone?: string | null;
  why_hot?: string | null;
  became_hot_at?: string | null;
};

type HotLeadsResponse = {
  leads: ExpleeHotLead[];
  total: number;
  has_more: boolean;
  next_offset?: number | null;
};

function requiredApiKey() {
  const value = process.env.EXPLEE_API_KEY?.trim();
  if (!value) throw new Error("EXPLEE_API_KEY is not configured.");
  return value;
}

function projectId() {
  const value = Number(process.env.EXPLEE_PROJECT_ID || DEFAULT_PROJECT_ID);
  if (!Number.isInteger(value) || value <= 0) throw new Error("EXPLEE_PROJECT_ID is invalid.");
  return value;
}

async function expleeGet<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${EXPLEE_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        "X-API-Key": requiredApiKey(),
        accept: "application/json"
      },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`Explee request failed with status ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizedPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

function normalizedEmail(value?: string | null) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function clipped(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function noteFor(lead: ExpleeHotLead) {
  return clipped([
    "[EXPLEE HOT LEAD]",
    lead.why_hot ? `Interested reply: ${lead.why_hot}` : null,
    lead.job_title ? `Job title: ${lead.job_title}` : null,
    lead.company_name ? `Company: ${lead.company_name}` : null,
    lead.company_domain ? `Company website: ${lead.company_domain}` : null,
    lead.country ? `Country: ${lead.country}` : null,
    lead.linkedin_url ? `LinkedIn: ${lead.linkedin_url}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.phone ? `Phone: ${lead.phone}` : null,
    `Explee campaign ID: ${lead.campaign_id}`,
    `Explee person ID: ${lead.person_id}`,
    lead.became_hot_at ? `Became hot: ${lead.became_hot_at}` : null
  ].filter(Boolean).join("\n"), 1950);
}

function newestTimestamp(leads: ExpleeHotLead[]) {
  let newest: string | null = null;
  let newestTime = Number.NEGATIVE_INFINITY;
  for (const lead of leads) {
    if (!lead.became_hot_at) continue;
    const time = new Date(lead.became_hot_at).getTime();
    if (Number.isFinite(time) && time > newestTime) {
      newestTime = time;
      newest = new Date(time).toISOString();
    }
  }
  return newest;
}

async function ensureIntegrationTables(db: ReturnType<typeof neon>) {
  await db.query(`CREATE TABLE IF NOT EXISTS integration_sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS explee_hot_lead_imports (
    external_key TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    campaign_id BIGINT NOT NULL,
    lead_id UUID,
    became_hot_at TIMESTAMPTZ,
    why_hot TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS explee_hot_lead_imports_campaign_idx
    ON explee_hot_lead_imports(campaign_id, became_hot_at DESC)`);
}

async function existingPhoneForEmail(db: ReturnType<typeof neon>, email: string | null) {
  if (!email) return null;
  const rows = await db.query(`SELECT phone FROM leads WHERE LOWER(email)=LOWER($1) ORDER BY updated_at DESC LIMIT 1`, [email]);
  return rows[0]?.phone ? String(rows[0].phone) : null;
}

async function alreadyImported(db: ReturnType<typeof neon>, externalKey: string) {
  const rows = await db.query(`SELECT 1 FROM explee_hot_lead_imports WHERE external_key=$1 LIMIT 1`, [externalKey]);
  return rows.length > 0;
}

async function importLead(db: ReturnType<typeof neon>, hotLead: ExpleeHotLead) {
  const externalKey = `${hotLead.campaign_id}:${hotLead.person_id}`;
  if (await alreadyImported(db, externalKey)) return { imported: false, duplicate: true };

  const email = normalizedEmail(hotLead.email);
  const directPhone = normalizedPhone(hotLead.phone);
  const existingPhone = directPhone ? null : await existingPhoneForEmail(db, email);
  const contactKey = directPhone || existingPhone || `explee:${hotLead.campaign_id}:${hotLead.person_id}`;

  const base = await getOrCreateLead(contactKey, "explee");
  const note = noteFor(hotLead);
  const updated = await updateLead(contactKey, {
    name: hotLead.name?.trim() || base.name,
    email: email || base.email,
    institution: hotLead.company_name?.trim() || base.institution,
    programme: hotLead.job_title?.trim() || base.programme,
    serviceInterest: base.serviceInterest || "B2B enquiry via Explee",
    status: base.status === "CONVERTED" || base.status === "LOST LEAD" ? base.status : "INTERESTED",
    handoffReason: hotLead.why_hot ? clipped(`Explee hot lead: ${hotLead.why_hot}`, 800) : "Explee marked this contact as a hot lead.",
    aiPaused: true,
    internalNote: note,
    priority: "HOT",
    followUpAt: base.status === "CONVERTED" || base.status === "LOST LEAD" ? base.followUpAt : new Date().toISOString()
  });

  if (hotLead.why_hot?.trim()) {
    await addMessage(contactKey, "user", `[Explee interested reply]\n${hotLead.why_hot.trim()}`, `explee-hot:${externalKey}`);
  }

  await db.query(
    `INSERT INTO explee_hot_lead_imports (external_key, person_id, campaign_id, lead_id, became_hot_at, why_hot, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (external_key) DO NOTHING`,
    [externalKey, hotLead.person_id, hotLead.campaign_id, updated.id, hotLead.became_hot_at || null, hotLead.why_hot || null, JSON.stringify(hotLead)]
  );

  return { imported: true, duplicate: false };
}

export async function syncExpleeHotLeads() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Explee hot-lead synchronization.");
  const db = neon(databaseUrl);

  // Ensure the existing CRM tables are present before integration-specific queries run.
  await listLeads();
  await ensureIntegrationTables(db);

  const targetProjectId = projectId();
  const stateKey = `explee_hot_leads_cursor_${targetProjectId}`;
  const stateRows = await db.query(`SELECT value FROM integration_sync_state WHERE key=$1 LIMIT 1`, [stateKey]);
  const pollStartedAt = new Date().toISOString();
  const since = stateRows[0]?.value
    ? String(stateRows[0].value)
    : new Date(Date.now() - INITIAL_LOOKBACK_MS).toISOString();

  const campaignResponse = await expleeGet<CampaignListResponse>(
    `/public/api/v1/autogtm/campaigns?project_id=${encodeURIComponent(String(targetProjectId))}`
  );
  const campaignIds = new Set((campaignResponse.campaigns || []).map((campaign) => Number(campaign.id)));
  if (!campaignIds.size) {
    throw new Error(`No active Explee campaigns were found for project ${targetProjectId}.`);
  }

  const fetched: ExpleeHotLead[] = [];
  let offset = 0;
  let page = 0;
  while (page < MAX_PAGES) {
    const response = await expleeGet<HotLeadsResponse>(
      `/public/api/v1/autogtm/hot-leads?since=${encodeURIComponent(since)}&limit=${PAGE_SIZE}&offset=${offset}`
    );
    fetched.push(...(response.leads || []));
    page += 1;
    if (!response.has_more) break;
    const nextOffset = Number(response.next_offset);
    if (!Number.isFinite(nextOffset) || nextOffset <= offset) {
      throw new Error("Explee pagination returned an invalid next offset.");
    }
    offset = nextOffset;
  }
  if (page >= MAX_PAGES && fetched.length >= PAGE_SIZE * MAX_PAGES) {
    throw new Error("Explee returned more hot leads than the safety page limit; cursor was not advanced.");
  }

  const projectLeads = fetched
    .filter((lead) => campaignIds.has(Number(lead.campaign_id)))
    .sort((a, b) => new Date(a.became_hot_at || 0).getTime() - new Date(b.became_hot_at || 0).getTime());

  let imported = 0;
  let duplicates = 0;
  for (const lead of projectLeads) {
    const result = await importLead(db, lead);
    if (result.imported) imported += 1;
    if (result.duplicate) duplicates += 1;
  }

  const newest = newestTimestamp(fetched);
  const nextCursor = newest || pollStartedAt;
  await db.query(
    `INSERT INTO integration_sync_state (key,value,updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [stateKey, nextCursor]
  );

  return {
    ok: true,
    projectId: targetProjectId,
    campaigns: campaignIds.size,
    checkedSince: since,
    fetched: fetched.length,
    matchedProject: projectLeads.length,
    imported,
    duplicates,
    nextCursor
  };
}
