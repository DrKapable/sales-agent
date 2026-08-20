import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { africasTalkingSmsConfigured, sendAfricasTalkingSms } from "@/lib/africas-talking-sms";
import { referralRecipients } from "@/lib/referrals";
import { getConversation, listLeads, updateLead } from "@/lib/store";
import { sendTeamCopies } from "@/lib/team-notifications";
import type { Lead } from "@/lib/types";

export type HumanFollowUpStatus = "PENDING" | "COMPLETED" | "DROPPED";
export type HumanFollowUpChannel = "CALL" | "WHATSAPP" | "SMS";
export type HumanFollowUpOutcome = "REACHED_CONTINUE" | "NO_ANSWER" | "INTERESTED" | "READY_TO_PROCEED" | "NOT_INTERESTED" | "OTHER";

export type HumanFollowUpTask = {
  id: string;
  phone: string;
  leadId: string | null;
  scheduledAt: string;
  status: HumanFollowUpStatus;
  reason: string | null;
  source: "MARY" | "MANUAL";
  sequenceStep: number;
  notifiedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  channel: HumanFollowUpChannel | null;
  summary: string | null;
  outcome: HumanFollowUpOutcome | null;
  message: string | null;
  transportStatus: string | null;
  nextScheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type FollowUpLeadView = Pick<Lead, "id" | "phone" | "name" | "serviceInterest" | "packageName" | "programme" | "deadline" | "status" | "priority" | "followUpAt" | "source" | "updatedAt">;

export type HumanFollowUpView = HumanFollowUpTask & {
  lead: FollowUpLeadView | null;
  dueState: "OVERDUE" | "DUE_TODAY" | "UPCOMING" | "DONE" | "DROPPED";
  lastClientMessage: string | null;
  lastAgentMessage: string | null;
  lastActivityAt: string | null;
  suggestedMessage: string;
};

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureTables() {
  const db = database();
  if (!db) return;
  initialized ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS human_follow_up_tasks (
      id UUID PRIMARY KEY,
      phone TEXT NOT NULL,
      lead_id TEXT,
      scheduled_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      reason TEXT,
      source TEXT NOT NULL DEFAULT 'MARY',
      sequence_step INTEGER NOT NULL DEFAULT 1,
      notified_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      completed_by TEXT,
      channel TEXT,
      summary TEXT,
      outcome TEXT,
      message TEXT,
      transport_status TEXT,
      next_scheduled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS human_follow_up_one_pending_per_phone ON human_follow_up_tasks(phone) WHERE status='PENDING'`);
    await db.query(`CREATE INDEX IF NOT EXISTS human_follow_up_due_idx ON human_follow_up_tasks(status, scheduled_at)`);
    await db.query(`CREATE TABLE IF NOT EXISTS human_follow_up_preferences (
      phone TEXT PRIMARY KEY,
      suppressed BOOLEAN NOT NULL DEFAULT FALSE,
      reason TEXT,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  })();
  await initialized;
}

function mapTask(row: any): HumanFollowUpTask {
  return {
    id: String(row.id),
    phone: String(row.phone),
    leadId: row.lead_id ? String(row.lead_id) : null,
    scheduledAt: new Date(String(row.scheduled_at)).toISOString(),
    status: String(row.status) as HumanFollowUpStatus,
    reason: row.reason ? String(row.reason) : null,
    source: String(row.source) === "MANUAL" ? "MANUAL" : "MARY",
    sequenceStep: Math.max(1, Number(row.sequence_step || 1)),
    notifiedAt: row.notified_at ? new Date(String(row.notified_at)).toISOString() : null,
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    completedBy: row.completed_by ? String(row.completed_by) : null,
    channel: row.channel ? String(row.channel) as HumanFollowUpChannel : null,
    summary: row.summary ? String(row.summary) : null,
    outcome: row.outcome ? String(row.outcome) as HumanFollowUpOutcome : null,
    message: row.message ? String(row.message) : null,
    transportStatus: row.transport_status ? String(row.transport_status) : null,
    nextScheduledAt: row.next_scheduled_at ? new Date(String(row.next_scheduled_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export function humanFollowUpInitialWaitHours(lead: Pick<Lead, "status" | "priority">) {
  if (lead.status === "PAYMENT PENDING" || lead.priority === "HOT") return 3;
  if (lead.status === "INTERESTED" || lead.priority === "WARM") return 4;
  return 6;
}

export function isHumanFollowUpEligible(lead: Pick<Lead, "status">) {
  return !["CONVERTED", "LOST LEAD"].includes(lead.status);
}

export function deriveHumanFollowUpDue(lead: Pick<Lead, "status" | "priority" | "followUpAt">, lastActivityAt: string) {
  const anchor = new Date(lastActivityAt);
  if (!Number.isFinite(anchor.getTime())) return null;
  const explicit = lead.followUpAt ? new Date(lead.followUpAt) : null;
  if (explicit && Number.isFinite(explicit.getTime()) && explicit.getTime() > anchor.getTime()) return explicit;
  return new Date(anchor.getTime() + humanFollowUpInitialWaitHours(lead) * 60 * 60 * 1000);
}

export function nextHumanFollowUpAt(mode: "tomorrow" | "manual", manualAt?: string | null, now = new Date()) {
  if (mode === "manual") {
    const parsed = manualAt ? new Date(manualAt) : null;
    return parsed && Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime() ? parsed : null;
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

export function humanFollowUpReason(lead: Pick<Lead, "status" | "serviceInterest" | "packageName">) {
  const service = lead.serviceInterest || lead.packageName || "the client's enquiry";
  if (lead.status === "PAYMENT PENDING") return `Payment-stage follow-up for ${service}`;
  if (lead.status === "INTERESTED") return `Conversion follow-up for ${service}`;
  if (lead.status === "QUALIFIED") return `Qualified lead follow-up for ${service}`;
  if (lead.status === "FOLLOW-UP REQUIRED") return `Scheduled follow-up for ${service}`;
  if (lead.status === "HUMAN ASSISTANCE REQUIRED") return `Human-assistance follow-up for ${service}`;
  return `Lead follow-up for ${service}`;
}

export function buildHumanFollowUpSuggestion(lead: Pick<Lead, "name" | "status" | "serviceInterest" | "packageName" | "deadline">, step = 1) {
  const first = lead.name?.trim().split(/\s+/)[0];
  const intro = first ? `Hi ${first},` : "Hi,";
  const service = lead.serviceInterest || lead.packageName || "your MedMinds enquiry";
  if (lead.status === "PAYMENT PENDING") return `${intro} I’m following up on ${service}. If you’re still ready to proceed, I can help you complete the next payment step or clarify anything that is holding you back.`;
  if (step >= 3) return `${intro} I’m following up on ${service}. If it is still a priority, we can continue from where you left off; if the timing has changed, just let me know and I’ll update our follow-up plan.`;
  if (lead.deadline) return `${intro} I’m following up on ${service}, with your ${lead.deadline} timeframe in mind. Is there anything you need clarified before you decide on the next step?`;
  return `${intro} I’m following up on ${service}. We can continue from exactly where you left off. Is there anything you need clarified before the next step?`;
}

async function suppressedPhones() {
  await ensureTables();
  const db = database();
  if (!db) return new Set<string>();
  const rows = await db.query(`SELECT phone FROM human_follow_up_preferences WHERE suppressed=TRUE`);
  return new Set(rows.map((row: any) => String(row.phone)));
}

async function pendingForPhone(phone: string) {
  await ensureTables();
  const db = database();
  if (!db) return null;
  const rows = await db.query(`SELECT * FROM human_follow_up_tasks WHERE phone=$1 AND status='PENDING' ORDER BY scheduled_at ASC LIMIT 1`, [phone]);
  return rows.length ? mapTask(rows[0]) : null;
}

async function createPendingTask(input: { lead: Lead; scheduledAt: Date; reason: string; source: "MARY" | "MANUAL"; sequenceStep?: number }) {
  await ensureTables();
  const db = database();
  if (!db) return null;
  const id = crypto.randomUUID();
  const rows = await db.query(`INSERT INTO human_follow_up_tasks (id,phone,lead_id,scheduled_at,status,reason,source,sequence_step)
    VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7)
    ON CONFLICT (phone) WHERE status='PENDING' DO UPDATE SET
      lead_id=EXCLUDED.lead_id,
      scheduled_at=CASE WHEN human_follow_up_tasks.source='MANUAL' AND EXCLUDED.source='MARY' THEN human_follow_up_tasks.scheduled_at ELSE EXCLUDED.scheduled_at END,
      reason=CASE WHEN human_follow_up_tasks.source='MANUAL' AND EXCLUDED.source='MARY' THEN human_follow_up_tasks.reason ELSE EXCLUDED.reason END,
      source=CASE WHEN EXCLUDED.source='MANUAL' THEN 'MANUAL' ELSE human_follow_up_tasks.source END,
      sequence_step=GREATEST(human_follow_up_tasks.sequence_step,EXCLUDED.sequence_step),
      notified_at=CASE WHEN human_follow_up_tasks.scheduled_at IS DISTINCT FROM EXCLUDED.scheduled_at AND EXCLUDED.source='MANUAL' THEN NULL ELSE human_follow_up_tasks.notified_at END,
      updated_at=NOW()
    RETURNING *`, [id, input.lead.phone, input.lead.id, input.scheduledAt.toISOString(), input.reason, input.source, input.sequenceStep || 1]);
  return rows.length ? mapTask(rows[0]) : null;
}

async function markClosedPending(phone: string, reason: string) {
  const db = database();
  if (!db) return;
  await db.query(`UPDATE human_follow_up_tasks SET status='DROPPED', summary=COALESCE(summary,$2), completed_at=NOW(), updated_at=NOW() WHERE phone=$1 AND status='PENDING'`, [phone, reason]);
}

function shortText(value: string | null | undefined, length = 180) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}

async function notifyDueDigest(items: Array<{ task: HumanFollowUpTask; lead: Lead; lastClientMessage: string | null }>) {
  if (!items.length) return false;
  const sorted = [...items].sort((a, b) => new Date(a.task.scheduledAt).getTime() - new Date(b.task.scheduledAt).getTime());
  const lines = sorted.slice(0, 12).map(({ task, lead, lastClientMessage }, index) => [
    `${index + 1}. ${lead.name || "Unnamed client"} · +${lead.phone.replace(/\D/g, "")}`,
    `${lead.serviceInterest || lead.packageName || "Service not established"} · ${lead.status} · ${lead.priority}`,
    `Due ${new Date(task.scheduledAt).toLocaleString("en-ZM", { timeZone: "Africa/Lusaka" })}`,
    lastClientMessage ? `Latest: ${shortText(lastClientMessage, 115)}` : null
  ].filter(Boolean).join("\n   "));
  const remaining = sorted.length - lines.length;
  const body = [
    `${sorted.length} client${sorted.length === 1 ? "" : "s"} now need human follow-up.`,
    "",
    ...lines,
    remaining > 0 ? `\n+ ${remaining} more due client${remaining === 1 ? "" : "s"} in the Follow-ups workspace.` : null,
    "",
    "Open Business Intelligence → Follow-ups to call, WhatsApp or SMS the client and log the outcome."
  ].filter(Boolean).join("\n");
  const results = await sendTeamCopies({
    heading: "Human follow-ups due",
    body,
    primary: referralRecipients.kanyembo,
    cc: [referralRecipients.conrad, referralRecipients.zabibu, referralRecipients.mustafa],
    includeDefaultCc: false
  });
  return results.some((result) => result.status === "fulfilled" && result.value.sent);
}

export async function syncHumanFollowUpQueue(options: { notifyDue?: boolean } = {}) {
  await ensureTables();
  const db = database();
  if (!db) return { checked: 0, scheduled: 0, due: 0, notified: 0, skipped: "database_not_configured" };
  const leads = await listLeads();
  const suppressed = await suppressedPhones();
  const now = new Date();
  let scheduled = 0;
  let dueCount = 0;
  let notified = 0;
  const unnotifiedDue: Array<{ task: HumanFollowUpTask; lead: Lead; lastClientMessage: string | null }> = [];

  for (const lead of leads) {
    if (!isHumanFollowUpEligible(lead)) {
      await markClosedPending(lead.phone, `Lead closed as ${lead.status}.`);
      if (lead.followUpAt) await updateLead(lead.phone, { followUpAt: null }).catch(() => undefined);
      continue;
    }
    if (suppressed.has(lead.phone)) continue;
    const history = await getConversation(lead.phone, 40).catch(() => []);
    const lastUser = [...history].reverse().find((message) => message.role === "user");
    if (!lastUser) continue;
    const lastActivity = history.at(-1) || lastUser;
    const due = deriveHumanFollowUpDue(lead, lastActivity.createdAt);
    if (!due) continue;

    let task = await pendingForPhone(lead.phone);
    if (!task) {
      task = await createPendingTask({ lead, scheduledAt: due, reason: humanFollowUpReason(lead), source: "MARY" });
      if (task) scheduled += 1;
    } else if (task.source === "MARY" && Math.abs(new Date(task.scheduledAt).getTime() - due.getTime()) > 60_000) {
      task = await createPendingTask({ lead, scheduledAt: due, reason: humanFollowUpReason(lead), source: "MARY", sequenceStep: task.sequenceStep });
    }
    if (!task) continue;
    if (!lead.followUpAt || Math.abs(new Date(lead.followUpAt).getTime() - new Date(task.scheduledAt).getTime()) > 60_000) {
      await updateLead(lead.phone, { followUpAt: task.scheduledAt }).catch(() => undefined);
    }
    if (new Date(task.scheduledAt).getTime() <= now.getTime()) {
      dueCount += 1;
      if (options.notifyDue !== false && !task.notifiedAt) {
        unnotifiedDue.push({ task, lead, lastClientMessage: lastUser.content || null });
      }
    }
  }

  if (unnotifiedDue.length) {
    const delivered = await notifyDueDigest(unnotifiedDue).catch((error) => {
      console.error("Human follow-up team notification digest failed", { due: unnotifiedDue.length, error });
      return false;
    });
    if (delivered) {
      const ids = unnotifiedDue.map((item) => item.task.id);
      await db.query(`UPDATE human_follow_up_tasks SET notified_at=NOW(),updated_at=NOW() WHERE id = ANY($1::uuid[])`, [ids]);
      notified = ids.length;
    }
  }
  return { checked: leads.length, scheduled, due: dueCount, notified };
}

function dueState(task: HumanFollowUpTask, now = new Date()): HumanFollowUpView["dueState"] {
  if (task.status === "COMPLETED") return "DONE";
  if (task.status === "DROPPED") return "DROPPED";
  const due = new Date(task.scheduledAt);
  const lusakaDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lusaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  if (due.getTime() <= now.getTime()) return "OVERDUE";
  if (lusakaDay(due) === lusakaDay(now)) return "DUE_TODAY";
  return "UPCOMING";
}

export async function listHumanFollowUps(limit = 250) {
  await ensureTables();
  const db = database();
  const leads = await listLeads();
  const leadByPhone = new Map(leads.map((lead) => [lead.phone, lead]));
  if (!db) return { tasks: [] as HumanFollowUpView[], availableLeads: leads, smsConfigured: africasTalkingSmsConfigured() };
  const rows = await db.query(`SELECT * FROM human_follow_up_tasks ORDER BY CASE WHEN status='PENDING' THEN 0 ELSE 1 END, scheduled_at ASC, updated_at DESC LIMIT $1`, [Math.max(20, Math.min(500, Math.round(limit)))]);
  const tasks: HumanFollowUpView[] = [];
  for (const row of rows) {
    const task = mapTask(row);
    const lead = leadByPhone.get(task.phone) || null;
    const history = await getConversation(task.phone, 24).catch(() => []);
    const lastClient = [...history].reverse().find((message) => message.role === "user") || null;
    const lastAgent = [...history].reverse().find((message) => message.role === "assistant") || null;
    const lastActivity = history.at(-1)?.createdAt || lead?.updatedAt || null;
    tasks.push({
      ...task,
      lead: lead ? {
        id: lead.id, phone: lead.phone, name: lead.name, serviceInterest: lead.serviceInterest, packageName: lead.packageName,
        programme: lead.programme, deadline: lead.deadline, status: lead.status, priority: lead.priority,
        followUpAt: lead.followUpAt, source: lead.source, updatedAt: lead.updatedAt
      } : null,
      dueState: dueState(task),
      lastClientMessage: lastClient?.content || null,
      lastAgentMessage: lastAgent?.content || null,
      lastActivityAt: lastActivity,
      suggestedMessage: lead ? buildHumanFollowUpSuggestion(lead, task.sequenceStep) : "Hello, I’m following up on your MedMinds enquiry. Is there anything you need clarified before the next step?"
    });
  }
  const pendingPhones = new Set(tasks.filter((task) => task.status === "PENDING").map((task) => task.phone));
  const suppressed = await suppressedPhones();
  const availableLeads = leads.filter((lead) => isHumanFollowUpEligible(lead) && !pendingPhones.has(lead.phone) && !suppressed.has(lead.phone));
  return { tasks, availableLeads, smsConfigured: africasTalkingSmsConfigured() };
}

export async function scheduleManualHumanFollowUp(input: { phone: string; scheduledAt: string; reason?: string | null; createdBy: string }) {
  await ensureTables();
  const db = database();
  if (!db) throw new Error("Follow-up database is unavailable.");
  const lead = (await listLeads()).find((item) => item.phone === input.phone);
  if (!lead) throw new Error("Client not found.");
  if (!isHumanFollowUpEligible(lead)) throw new Error("Closed leads cannot be scheduled for follow-up.");
  const scheduledAt = new Date(input.scheduledAt);
  if (!Number.isFinite(scheduledAt.getTime())) throw new Error("Choose a valid follow-up date and time.");
  await db.query(`INSERT INTO human_follow_up_preferences(phone,suppressed,reason,updated_by,updated_at) VALUES($1,FALSE,NULL,$2,NOW()) ON CONFLICT(phone) DO UPDATE SET suppressed=FALSE,reason=NULL,updated_by=$2,updated_at=NOW()`, [lead.phone, input.createdBy]);
  const task = await createPendingTask({ lead, scheduledAt, reason: input.reason?.trim() || `Manually scheduled by ${input.createdBy}`, source: "MANUAL" });
  await updateLead(lead.phone, { followUpAt: scheduledAt.toISOString() });
  return task;
}

export async function sendHumanFollowUpSms(taskId: string, message: string) {
  await ensureTables();
  const db = database();
  if (!db) throw new Error("Follow-up database is unavailable.");
  const rows = await db.query(`SELECT * FROM human_follow_up_tasks WHERE id=$1 LIMIT 1`, [taskId]);
  if (!rows.length) throw new Error("Follow-up task not found.");
  const task = mapTask(rows[0]);
  if (task.status !== "PENDING") throw new Error("This follow-up is already closed.");
  const result = await sendAfricasTalkingSms({ to: task.phone, message });
  await db.query(`UPDATE human_follow_up_tasks SET message=$2,transport_status=$3,updated_at=NOW() WHERE id=$1`, [task.id, message.trim(), `${result.status}${result.messageId ? ` · ${result.messageId}` : ""}`]);
  return result;
}

export async function completeHumanFollowUp(input: {
  taskId: string;
  completedBy: string;
  channel: HumanFollowUpChannel;
  summary: string;
  outcome: HumanFollowUpOutcome;
  nextMode: "tomorrow" | "manual" | "drop";
  nextAt?: string | null;
}) {
  await ensureTables();
  const db = database();
  if (!db) throw new Error("Follow-up database is unavailable.");
  const rows = await db.query(`SELECT * FROM human_follow_up_tasks WHERE id=$1 LIMIT 1`, [input.taskId]);
  if (!rows.length) throw new Error("Follow-up task not found.");
  const task = mapTask(rows[0]);
  if (task.status !== "PENDING") throw new Error("This follow-up has already been completed or dropped.");
  const summary = input.summary.trim();
  if (summary.length < 5) throw new Error("Add a brief summary of the follow-up before completing it.");
  const lead = (await listLeads()).find((item) => item.phone === task.phone) || null;

  if (input.nextMode === "drop") {
    await db.query(`UPDATE human_follow_up_tasks SET status='DROPPED',completed_at=NOW(),completed_by=$2,channel=$3,summary=$4,outcome=$5,next_scheduled_at=NULL,updated_at=NOW() WHERE id=$1`, [task.id, input.completedBy, input.channel, summary, input.outcome]);
    await db.query(`INSERT INTO human_follow_up_preferences(phone,suppressed,reason,updated_by,updated_at) VALUES($1,TRUE,$2,$3,NOW()) ON CONFLICT(phone) DO UPDATE SET suppressed=TRUE,reason=$2,updated_by=$3,updated_at=NOW()`, [task.phone, summary, input.completedBy]);
    if (lead) await updateLead(task.phone, { followUpAt: null, ...(input.outcome === "NOT_INTERESTED" ? { status: "LOST LEAD" as const } : {}) });
    return { status: "DROPPED" as const, nextScheduledAt: null };
  }

  const next = nextHumanFollowUpAt(input.nextMode, input.nextAt);
  if (!next) throw new Error("Choose a future date and time for the next follow-up.");
  await db.query(`UPDATE human_follow_up_tasks SET status='COMPLETED',completed_at=NOW(),completed_by=$2,channel=$3,summary=$4,outcome=$5,next_scheduled_at=$6,updated_at=NOW() WHERE id=$1`, [task.id, input.completedBy, input.channel, summary, input.outcome, next.toISOString()]);
  if (lead) {
    await db.query(`INSERT INTO human_follow_up_tasks(id,phone,lead_id,scheduled_at,status,reason,source,sequence_step) VALUES($1,$2,$3,$4,'PENDING',$5,'MANUAL',$6)`, [crypto.randomUUID(), lead.phone, lead.id, next.toISOString(), `Next human follow-up after ${input.channel.toLowerCase()} contact`, task.sequenceStep + 1]);
    await db.query(`INSERT INTO human_follow_up_preferences(phone,suppressed,reason,updated_by,updated_at) VALUES($1,FALSE,NULL,$2,NOW()) ON CONFLICT(phone) DO UPDATE SET suppressed=FALSE,reason=NULL,updated_by=$2,updated_at=NOW()`, [lead.phone, input.completedBy]);
    await updateLead(lead.phone, { followUpAt: next.toISOString() });
  }
  return { status: "COMPLETED" as const, nextScheduledAt: next.toISOString() };
}
