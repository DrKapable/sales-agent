import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { referralRecipients } from "@/lib/referrals";

export type TeamRole = "director" | "sales" | "marketing" | "support";
export type TeamMember = { id: string; name: string; phone: string; role: TeamRole; active: boolean; dailyBriefEnabled: boolean; priorityAlertsEnabled: boolean };
type Db = NeonQueryFunction<false, false>;

const seedMembers: ReadonlyArray<{ name: string; phone: string; role: TeamRole }> = [
  { name: referralRecipients.mustafa.name, phone: referralRecipients.mustafa.phone || "", role: "director" },
  { name: referralRecipients.kanyembo.name, phone: referralRecipients.kanyembo.phone || "", role: "sales" },
  { name: referralRecipients.conrad.name, phone: referralRecipients.conrad.phone || "", role: "marketing" },
  { name: referralRecipients.zabibu.name, phone: referralRecipients.zabibu.phone || "", role: "support" }
];

let sql: Db | null = null;
let setup: Promise<void> | null = null;
function db(): Db {
  if (!process.env.DATABASE_URL) throw new Error("The staff directory requires persistent database storage.");
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

/** Match a WhatsApp sender's complete E.164 number; never match by name or phone suffix. */
export function canonicalTeamPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return "260" + digits.slice(1);
  if (digits.length === 9 && digits.startsWith("9")) return "260" + digits;
  return digits;
}
export function canReadTeamData(role: TeamRole, section: "overview" | "leads" | "attention" | "finance" | "marketing") {
  if (role === "director") return true;
  if (section === "finance") return false;
  if (section === "marketing") return role === "marketing";
  if (section === "leads" || section === "attention") return role === "sales" || role === "support";
  return true;
}

async function ensureTables() {
  const database = db();
  setup ??= (async () => {
    await database.query(`CREATE TABLE IF NOT EXISTS team_staff (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      phone_digits TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('director','sales','marketing','support')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      daily_brief_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      priority_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await database.query(`ALTER TABLE team_staff ADD COLUMN IF NOT EXISTS daily_brief_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
    await database.query(`ALTER TABLE team_staff ADD COLUMN IF NOT EXISTS priority_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
    await database.query(`CREATE TABLE IF NOT EXISTS team_chat_messages (
      id UUID PRIMARY KEY, staff_id UUID NOT NULL REFERENCES team_staff(id),
      external_id TEXT UNIQUE, role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await database.query(`CREATE INDEX IF NOT EXISTS team_chat_staff_created_idx ON team_chat_messages(staff_id, created_at DESC)`);
    await database.query(`CREATE TABLE IF NOT EXISTS team_staff_audit (
      id UUID PRIMARY KEY, staff_id UUID NOT NULL, action TEXT NOT NULL,
      change_snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    // Initial approved phone numbers; ON CONFLICT never reactivates or overrides admin changes.
    for (const member of seedMembers) {
      if (!member.phone) continue;
      await database.query(
        `INSERT INTO team_staff (id,name,phone_digits,role) VALUES ($1,$2,$3,$4)
         ON CONFLICT (phone_digits) DO NOTHING`,
        [crypto.randomUUID(), member.name, canonicalTeamPhone(member.phone), member.role]
      );
    }
  })().catch((error) => { setup = null; throw error; });
  await setup;
}

function mapMember(row: Record<string, unknown>): TeamMember {
  return { id: String(row.id), name: String(row.name), phone: String(row.phone_digits), role: String(row.role) as TeamRole, active: Boolean(row.active), dailyBriefEnabled: row.daily_brief_enabled !== false, priorityAlertsEnabled: row.priority_alerts_enabled !== false };
}

export async function findTeamMember(phone: string): Promise<TeamMember | null> {
  await ensureTables(); // fail closed if directory cannot be checked
  const normalized = canonicalTeamPhone(phone);
  if (!/^[1-9]\d{8,14}$/.test(normalized)) return null;
  const rows = await db().query(`SELECT * FROM team_staff WHERE phone_digits=$1 AND active=TRUE LIMIT 1`, [normalized]);
  return rows[0] ? mapMember(rows[0]) : null;
}
export async function listTeamMembers() {
  await ensureTables();
  const rows = await db().query(`SELECT * FROM team_staff ORDER BY CASE role WHEN 'director' THEN 0 WHEN 'sales' THEN 1 WHEN 'marketing' THEN 2 ELSE 3 END, name`);
  return rows.map(mapMember);
}

/** Staff edits require a second admin password check in the API. */
export async function saveTeamMember(input: { id?: string; name: string; phone: string; role: TeamRole; active: boolean; dailyBriefEnabled?: boolean; priorityAlertsEnabled?: boolean }) {
  await ensureTables();
  const phone = canonicalTeamPhone(input.phone);
  if (!/^[1-9]\d{8,14}$/.test(phone)) throw new Error("Enter a valid international WhatsApp phone number.");
  const database = db();
  const id = input.id || crypto.randomUUID();
  if (input.id) {
    const old = await database.query(`SELECT * FROM team_staff WHERE id=$1`, [id]);
    if (!old.length) throw new Error("Staff member not found.");
    if (old[0].role === "director" && (!input.active || input.role !== "director")) {
      throw new Error("The director account cannot be deactivated or demoted here.");
    }
  } else if (input.role === "director") {
    throw new Error("Additional director accounts require a separate privileged approval workflow.");
  }
  const rows = input.id
    ? await database.query(`UPDATE team_staff SET name=$2, phone_digits=$3,role=$4,active=$5,daily_brief_enabled=$6,priority_alerts_enabled=$7,updated_at=NOW()
        WHERE id=$1 RETURNING *`, [id, input.name.trim(), phone, input.role, input.active, input.dailyBriefEnabled ?? true, input.priorityAlertsEnabled ?? true])
    : await database.query(`INSERT INTO team_staff (id,name,phone_digits,role,active,daily_brief_enabled,priority_alerts_enabled)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, input.name.trim(), phone, input.role, input.active, input.dailyBriefEnabled ?? true, input.priorityAlertsEnabled ?? true]);
  await database.query(`INSERT INTO team_staff_audit (id,staff_id,action,change_snapshot)
    VALUES ($1,$2,$3,$4::jsonb)`, [crypto.randomUUID(), id, input.id ? "update" : "create", JSON.stringify({ name: input.name.trim(), phone, role: input.role, active: input.active, dailyBriefEnabled: input.dailyBriefEnabled ?? true, priorityAlertsEnabled: input.priorityAlertsEnabled ?? true })]);
  return mapMember(rows[0]);
}

export async function recordTeamInbound(staffId: string, text: string, externalId: string) {
  await ensureTables();
  const rows = await db().query(`INSERT INTO team_chat_messages (id,staff_id,external_id,role,content)
    VALUES ($1,$2,$3,'user',$4) ON CONFLICT (external_id) DO NOTHING RETURNING id`,
    [crypto.randomUUID(), staffId, externalId, text]);
  return rows.length > 0;
}
export async function recordTeamReply(staffId: string, text: string, externalId?: string) {
  await ensureTables();
  await db().query(`INSERT INTO team_chat_messages (id,staff_id,external_id,role,content)
    VALUES ($1,$2,$3,'assistant',$4) ON CONFLICT (external_id) DO NOTHING`,
    [crypto.randomUUID(), staffId, externalId || null, text]);
}
export async function recentTeamMessages(staffId: string, limit = 14) {
  await ensureTables();
  const rows = await db().query(`SELECT role,content,created_at FROM team_chat_messages
    WHERE staff_id=$1 ORDER BY created_at DESC LIMIT $2`, [staffId, Math.max(1, Math.min(limit, 40))]);
  return rows.reverse().map((r) => ({ role: String(r.role), content: String(r.content).slice(0, 2000), createdAt: String(r.created_at) }));
}
export async function staffInboundSessionOpen(phone: string, since: Date) {
  const member = await findTeamMember(phone);
  if (!member) return false;
  const rows = await db().query(`SELECT 1 FROM team_chat_messages WHERE staff_id=$1 AND role='user' AND created_at >= $2 LIMIT 1`, [member.id, since.toISOString()]);
  return rows.length > 0;
}

export async function isRegisteredTeamPhone(phone: string) {
  await ensureTables();
  const normalized = canonicalTeamPhone(phone);
  if (!/^[1-9]\d{8,14}$/.test(normalized)) return false;
  const rows = await db().query(`SELECT 1 FROM team_staff WHERE phone_digits=$1 LIMIT 1`, [normalized]);
  return rows.length > 0;
}
