import { gateway, ToolLoopAgent } from "ai";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt-kaunda";
import { getAiModelCandidates } from "@/lib/env";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { getConversation, listLeads, updateLead, addMessage } from "@/lib/store";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { getWhatsAppSender } from "@/lib/whatsapp-sender-context";
import { sendWhatsAppFollowUpTemplate } from "@/lib/whatsapp-template";
import type { ConversationMessage, Lead } from "@/lib/types";

export const FOLLOW_UP_STEPS = [
  { waitHours: 6, strategy: "relevance_reciprocity", label: "Relevance + useful next step" },
  { waitHours: 42, strategy: "commitment_consistency", label: "Commitment + continuity" },
  { waitHours: 72, strategy: "certainty_authority", label: "Certainty + verified process" },
  { waitHours: 120, strategy: "timing_loss_avoidance", label: "Genuine timing relevance" },
  { waitHours: 240, strategy: "unity_autonomy", label: "Unity + autonomy" }
] as const;

const MAX_PER_RUN = 12;
const SERVICE_WINDOW_MS = 23.5 * 60 * 60 * 1000;
const STOP_STATUSES = new Set(["CONVERTED", "LOST LEAD", "HUMAN ASSISTANCE REQUIRED"]);
const PRIORITY_RANK: Record<Lead["priority"], number> = { STANDARD: 0, WARM: 1, HOT: 2 };
const STATUS_RANK: Partial<Record<Lead["status"], number>> = {
  "NEW LEAD": 0,
  QUALIFIED: 1,
  INTERESTED: 2,
  "FOLLOW-UP REQUIRED": 2,
  "PAYMENT PENDING": 3
};

export type FollowUpState = {
  phone: string;
  anchorUserAt: string;
  step: number;
  lastSentAt: string | null;
  lastAttemptAt: string | null;
  lastResult: string | null;
};

type FollowUpCandidate = {
  lead: Lead;
  history: ConversationMessage[];
  lastUser: ConversationMessage;
  state: FollowUpState;
  due: Date;
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
    await db.query(`CREATE TABLE IF NOT EXISTS lead_follow_up_state (
      phone TEXT PRIMARY KEY,
      anchor_user_at TIMESTAMPTZ NOT NULL,
      step INTEGER NOT NULL DEFAULT 0,
      last_sent_at TIMESTAMPTZ,
      last_attempt_at TIMESTAMPTZ,
      last_result TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`ALTER TABLE lead_follow_up_state ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ`);
    await db.query(`CREATE TABLE IF NOT EXISTS lead_follow_up_events (
      id UUID PRIMARY KEY,
      phone TEXT NOT NULL,
      anchor_user_at TIMESTAMPTZ NOT NULL,
      step INTEGER NOT NULL,
      strategy TEXT NOT NULL,
      transport TEXT NOT NULL,
      template_name TEXT,
      message_id TEXT,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      response_at TIMESTAMPTZ
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS lead_follow_up_events_phone_sent_idx ON lead_follow_up_events(phone, sent_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS lead_follow_up_events_response_idx ON lead_follow_up_events(response_at) WHERE response_at IS NOT NULL`);
  })();
  await initialized;
}

async function getState(phone: string): Promise<FollowUpState | null> {
  await ensureTables();
  const db = database();
  if (!db) return null;
  const rows = await db.query(`SELECT phone, anchor_user_at, step, last_sent_at, last_attempt_at, last_result FROM lead_follow_up_state WHERE phone=$1`, [phone]);
  if (!rows.length) return null;
  const row = rows[0];
  return {
    phone: String(row.phone),
    anchorUserAt: new Date(String(row.anchor_user_at)).toISOString(),
    step: Number(row.step),
    lastSentAt: row.last_sent_at ? new Date(String(row.last_sent_at)).toISOString() : null,
    lastAttemptAt: row.last_attempt_at ? new Date(String(row.last_attempt_at)).toISOString() : null,
    lastResult: row.last_result ? String(row.last_result) : null
  };
}

async function saveState(state: FollowUpState) {
  await ensureTables();
  const db = database();
  if (!db) return;
  await db.query(`INSERT INTO lead_follow_up_state (phone, anchor_user_at, step, last_sent_at, last_attempt_at, last_result, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (phone) DO UPDATE SET anchor_user_at=$2,step=$3,last_sent_at=$4,last_attempt_at=$5,last_result=$6,updated_at=NOW()`,
    [state.phone, state.anchorUserAt, state.step, state.lastSentAt, state.lastAttemptAt, state.lastResult]);
}

async function recordFollowUpEvent(input: {
  phone: string;
  anchorUserAt: string;
  step: number;
  strategy: string;
  transport: "freeform" | "template";
  templateName?: string | null;
  messageId: string;
  sentAt: string;
}) {
  await ensureTables();
  const db = database();
  if (!db) return;
  await db.query(`INSERT INTO lead_follow_up_events (id,phone,anchor_user_at,step,strategy,transport,template_name,message_id,sent_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
    crypto.randomUUID(), input.phone, input.anchorUserAt, input.step, input.strategy,
    input.transport, input.templateName || null, input.messageId, input.sentAt
  ]);
}

async function markLatestFollowUpResponded(phone: string, userAt: string) {
  await ensureTables();
  const db = database();
  if (!db) return false;
  const rows = await db.query(`UPDATE lead_follow_up_events SET response_at=$2
    WHERE id=(
      SELECT id FROM lead_follow_up_events
      WHERE phone=$1 AND response_at IS NULL AND sent_at < $2
      ORDER BY sent_at DESC LIMIT 1
    ) RETURNING id`, [phone, userAt]);
  return rows.length > 0;
}

export async function getFollowUpPerformance(days = 30) {
  await ensureTables();
  const db = database();
  if (!db) return { days, sent: 0, responded: 0, responseRate: 0, freeform: 0, templates: 0 };
  const rows = await db.query(`SELECT
    COUNT(*)::int AS sent,
    COUNT(*) FILTER (WHERE response_at IS NOT NULL)::int AS responded,
    COUNT(*) FILTER (WHERE transport='freeform')::int AS freeform,
    COUNT(*) FILTER (WHERE transport='template')::int AS templates
    FROM lead_follow_up_events
    WHERE sent_at >= NOW() - ($1::int * INTERVAL '1 day')`, [Math.max(1, Math.min(365, Math.round(days)))]);
  const sent = Number(rows[0]?.sent ?? 0);
  const responded = Number(rows[0]?.responded ?? 0);
  return {
    days,
    sent,
    responded,
    responseRate: sent ? Math.round((responded / sent) * 100) : 0,
    freeform: Number(rows[0]?.freeform ?? 0),
    templates: Number(rows[0]?.templates ?? 0)
  };
}

function isExplicitOptOut(text: string) {
  const clean = text.trim().toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (/\b(unsubscribe|do not contact me|don't contact me|dont contact me|stop messaging me|stop contacting me|no more messages|leave me alone)\b/i.test(clean)) return true;
  return /^(stop|no thanks|not interested|i am not interested|i'm not interested|not for me)$/.test(clean);
}

function isEligibleToSend(lead: Lead) {
  return lead.source === "whatsapp" && !lead.aiPaused && !STOP_STATUSES.has(lead.status);
}

export function initialFollowUpWaitHours(lead: Pick<Lead, "status" | "priority">) {
  if (lead.status === "PAYMENT PENDING" || lead.priority === "HOT") return 3;
  if (lead.status === "INTERESTED" || lead.priority === "WARM") return 4;
  return FOLLOW_UP_STEPS[0].waitHours;
}

export function computeFollowUpDue(input: {
  anchorUserAt: string;
  step: number;
  lastSentAt: string | null;
  lead: Pick<Lead, "status" | "priority" | "followUpAt">;
}) {
  if (input.step >= FOLLOW_UP_STEPS.length) return null;
  const anchor = new Date(input.anchorUserAt);
  if (!Number.isFinite(anchor.getTime())) return null;

  if (input.step === 0) {
    let due = new Date(anchor.getTime() + initialFollowUpWaitHours(input.lead) * 60 * 60 * 1000);
    if (input.lead.status === "FOLLOW-UP REQUIRED" && input.lead.followUpAt) {
      const explicit = new Date(input.lead.followUpAt);
      if (Number.isFinite(explicit.getTime()) && explicit.getTime() > anchor.getTime() && explicit.getTime() > due.getTime()) due = explicit;
    }
    return due;
  }

  const previousSent = input.lastSentAt ? new Date(input.lastSentAt) : null;
  if (previousSent && Number.isFinite(previousSent.getTime())) {
    return new Date(previousSent.getTime() + FOLLOW_UP_STEPS[input.step].waitHours * 60 * 60 * 1000);
  }

  let cumulativeHours = initialFollowUpWaitHours(input.lead);
  for (let index = 1; index <= input.step; index += 1) cumulativeHours += FOLLOW_UP_STEPS[index].waitHours;
  return new Date(anchor.getTime() + cumulativeHours * 60 * 60 * 1000);
}

export function isMedMindsContactHour(now = new Date()) {
  const lusakaHour = (now.getUTCHours() + 2) % 24;
  return lusakaHour >= 8 && lusakaHour <= 20;
}

function retryAllowed(state: FollowUpState, now: Date) {
  if (!state.lastAttemptAt) return true;
  const last = new Date(state.lastAttemptAt).getTime();
  if (!Number.isFinite(last)) return true;
  const elapsed = now.getTime() - last;
  if (state.lastResult === "template_required") return elapsed >= 24 * 60 * 60 * 1000;
  if (state.lastResult === "send_failed") return elapsed >= 6 * 60 * 60 * 1000;
  return elapsed >= 2 * 60 * 60 * 1000;
}

function firstName(lead: Lead) {
  return lead.name?.trim().split(/\s+/)[0] || null;
}

function serviceName(lead: Lead) {
  return lead.serviceInterest || lead.packageName || "what you asked about";
}

export function buildFollowUpFallback(lead: Lead, step: number) {
  const name = firstName(lead);
  const intro = name ? `Hi ${name},` : "Hi,";
  const service = serviceName(lead);

  if (step === 0) {
    if (lead.status === "PAYMENT PENDING") {
      return `${intro} you were ready to move ahead with ${service}. I can make the next step easy and resend the verified payment instructions so you don’t have to search back through the chat. Would you like me to send them?`;
    }
    if (lead.status === "INTERESTED") {
      return `${intro} you were considering ${service}. We can continue from exactly where you left off without starting over. Would you like me to prepare the quotation?`;
    }
    if (lead.status === "QUALIFIED" && !lead.deadline) {
      return `${intro} you mentioned ${service}. The deadline is usually the one detail that helps us recommend the right support without overcomplicating things. When do you need it completed?`;
    }
    return `${intro} you were asking about ${service}. I can keep this simple and point you to the most relevant next step. What are you working on right now?`;
  }

  if (step === 1) {
    return `${intro} you were considering ${service}. Since you already identified it as something you need, the next step can stay small: we can first confirm the exact scope before anything else. Would you like to continue from there?`;
  }

  if (step === 2) {
    return `${intro} if uncertainty is what is holding you back on ${service}, we can first put the scope and price clearly in writing before you decide. Would a formal quotation help?`;
  }

  if (step === 3) {
    if (lead.deadline) {
      return `${intro} your ${service} deadline is ${lead.deadline}. Deciding the scope earlier leaves more room for review and revisions; there is no need to rush into a package. Would you like to continue?`;
    }
    return `${intro} if ${service} is still a priority, we can pick up from the exact point you stopped and keep the next step simple. Would you like to continue?`;
  }

  return `${intro} this is my final check-in about ${service}. If it is still something you are working on, we can continue from where you left off; if not, no problem at all. You can message MedMinds whenever the timing is right.`;
}

function strategyInstruction(step: number) {
  if (step === 0) return "Focus attention on the client's own stated goal first. Give one small useful orientation or simplification before the ask, then ask one easy question. This is relevance and reciprocity, not a sales pitch.";
  if (step === 1) return "Use commitment and consistency ethically: refer to the client's own earlier interest or stated need, then invite one small next action that is consistent with that goal. Do not imply they promised to buy.";
  if (step === 2) return "Reduce uncertainty before asking. Use only verified process/credibility cues that are supported by the transcript or MedMinds rules, such as a formal quotation or clear written scope. Never invent testimonials, client counts, credentials or guarantees.";
  if (step === 3) return "Use genuine timing relevance only. If a real client deadline is known, make that the focal point and explain the practical benefit of deciding scope earlier. Never invent scarcity, limited slots, expiring prices or urgency.";
  return "Use unity and autonomy: make it clear we can continue from where the client left off and they do not need to restart. This is the final check-in, so remove pressure and explicitly leave the choice with the client.";
}

function enforceSingleQuestion(text: string) {
  const questionIndexes = [...text].map((character, index) => character === "?" ? index : -1).filter((index) => index >= 0);
  if (questionIndexes.length <= 1) return text;
  const keep = questionIndexes.at(-1);
  return [...text].map((character, index) => character === "?" && index !== keep ? "." : character).join("");
}

function compactFollowUp(text: string) {
  let value = enforceSingleQuestion(text.trim().replaceAll("—", ",")).replace(/\n{3,}/g, "\n\n");
  if (value.length <= 430) return value;
  const parts = value.split(/(?<=[.!?])\s+|\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const question = [...parts].reverse().find((part) => part.includes("?"));
  const selected: string[] = [];
  for (const part of parts) {
    const candidate = [...selected, part].join(" ");
    if (candidate.length > 360 && selected.length) break;
    selected.push(part);
    if (candidate.length >= 330) break;
  }
  if (question && !selected.includes(question) && [...selected, question].join(" ").length <= 430) selected.push(question);
  value = selected.join(" ") || value.slice(0, 427).trimEnd() + "…";
  return enforceSingleQuestion(value);
}

async function generateFollowUp(lead: Lead, step: number, history: ConversationMessage[]) {
  const transcript = history.slice(-14).map((message) => `${message.role === "user" ? "Client" : "Mary"}: ${message.content}`).join("\n");
  const instructions = `${SALES_AGENT_PROMPT}\n\nAUTOMATED FOLLOW-UP\nYou are writing follow-up ${step + 1} of at most ${FOLLOW_UP_STEPS.length} for an unconverted MedMinds lead. This is not a new conversation.\n\nETHICAL PRE-SUASION\n- The key is what receives attention immediately before the request. Begin with the client's own goal, concern or previously stated need, not with \"just checking in\".\n- ${strategyInstruction(step)}\n- Use the client's own words/context where possible, but do not fabricate details.\n- Give before asking when possible: a small clarification, simplification, useful framing or reduction of uncertainty is better than another sales claim.\n- Never manipulate, shame, exploit fear, invent social proof, invent urgency, or hide material information.\n\nMESSAGE RULES\n- 25-55 words is ideal; never exceed 3 short sentences unless a necessary verified process detail makes that impossible.\n- Ask at most one question.\n- One message, one next action.\n- Do not repeat a previous follow-up.\n- Do not say this is automated and do not mention Pre-Suasion or persuasion principles.\n- Do not invent discounts, prices, scarcity, testimonials, guarantees or payment details.\n- If the lead is PAYMENT PENDING, offer to resend the verified payment instructions rather than writing payment details from memory.\n- If the lead is INTERESTED, a good micro-close is offering a quotation.\n- If this is the final follow-up, make it clear this is the final check-in and that the client can return later without pressure.`;

  let lastError: unknown = null;
  for (const model of getAiModelCandidates()) {
    try {
      const agent = new ToolLoopAgent({ model: gateway(model), instructions });
      const result = await agent.generate({
        prompt: `Lead context: ${JSON.stringify({
          name: lead.name,
          serviceInterest: lead.serviceInterest,
          packageName: lead.packageName,
          programme: lead.programme,
          deadline: lead.deadline,
          status: lead.status,
          priority: lead.priority
        })}\n\nRecent conversation:\n${transcript}\n\nWrite only the WhatsApp follow-up message.`
      });
      const text = compactFollowUp(result.text);
      if (text) return text;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn("Follow-up AI generation failed; using conversion-safe fallback", { phoneSuffix: lead.phone.slice(-4), step: step + 1, error: lastError });
  return compactFollowUp(buildFollowUpFallback(lead, step));
}

function templateConfig(step: number) {
  const slot = Math.max(1, Math.min(FOLLOW_UP_STEPS.length, step + 1));
  const specificName = process.env[`WHATSAPP_FOLLOWUP_TEMPLATE_${slot}_NAME`]?.trim();
  const baseName = process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME?.trim();
  const name = specificName || baseName;
  if (!name) return null;
  const language = process.env[`WHATSAPP_FOLLOWUP_TEMPLATE_${slot}_LANGUAGE`]?.trim()
    || process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE?.trim()
    || "en_US";
  return { name, language };
}

function timesClose(a: string | null, b: Date) {
  if (!a) return false;
  const value = new Date(a).getTime();
  return Number.isFinite(value) && Math.abs(value - b.getTime()) < 60_000;
}

export async function runAutomatedFollowUps() {
  const now = new Date();
  if (!isMedMindsContactHour(now)) {
    return { checked: 0, eligible: 0, due: 0, processed: 0, skipped: "outside_medminds_contact_hours", results: [], performance: await getFollowUpPerformance() };
  }

  const whatsappLeads = (await listLeads()).filter((lead) => lead.source === "whatsapp");
  const candidates: FollowUpCandidate[] = [];
  const results: Array<{ phoneSuffix: string; step: number; status: string; strategy?: string; transport?: string }> = [];
  let eligible = 0;

  for (const lead of whatsappLeads) {
    const history = await getConversation(lead.phone, 40);
    const lastUser = [...history].reverse().find((message) => message.role === "user");
    if (!lastUser) continue;

    let state = await getState(lead.phone);
    if (state?.lastSentAt && new Date(lastUser.createdAt).getTime() > new Date(state.lastSentAt).getTime()) {
      await markLatestFollowUpResponded(lead.phone, lastUser.createdAt).catch((error) => {
        console.warn("Unable to attribute follow-up response", { phoneSuffix: lead.phone.slice(-4), error });
      });
    }

    if (isExplicitOptOut(lastUser.content)) {
      const stopped: FollowUpState = {
        phone: lead.phone,
        anchorUserAt: lastUser.createdAt,
        step: FOLLOW_UP_STEPS.length,
        lastSentAt: state?.lastSentAt || null,
        lastAttemptAt: state?.lastAttemptAt || null,
        lastResult: "opted_out"
      };
      await saveState(stopped);
      if (lead.status !== "LOST LEAD") await updateLead(lead.phone, { status: "LOST LEAD", followUpAt: null }).catch(() => undefined);
      results.push({ phoneSuffix: lead.phone.slice(-4), step: 0, status: "opted_out" });
      continue;
    }

    if (!isEligibleToSend(lead)) {
      if (lead.followUpAt) await updateLead(lead.phone, { followUpAt: null }).catch(() => undefined);
      continue;
    }
    eligible += 1;

    if (!state || state.anchorUserAt !== lastUser.createdAt) {
      state = {
        phone: lead.phone,
        anchorUserAt: lastUser.createdAt,
        step: 0,
        lastSentAt: null,
        lastAttemptAt: null,
        lastResult: "reset_on_client_message"
      };
      await saveState(state);
    }
    if (state.step >= FOLLOW_UP_STEPS.length) continue;

    const due = computeFollowUpDue({
      anchorUserAt: state.anchorUserAt,
      step: state.step,
      lastSentAt: state.lastSentAt,
      lead
    });
    if (!due) continue;
    if (!timesClose(lead.followUpAt, due)) await updateLead(lead.phone, { followUpAt: due.toISOString() }).catch(() => undefined);
    if (due.getTime() > now.getTime() || !retryAllowed(state, now)) continue;

    candidates.push({ lead, history, lastUser, state, due });
  }

  candidates.sort((a, b) => {
    const priority = PRIORITY_RANK[b.lead.priority] - PRIORITY_RANK[a.lead.priority];
    if (priority) return priority;
    const status = (STATUS_RANK[b.lead.status] ?? 0) - (STATUS_RANK[a.lead.status] ?? 0);
    if (status) return status;
    return a.due.getTime() - b.due.getTime();
  });

  for (const candidate of candidates.slice(0, MAX_PER_RUN)) {
    const { lead, history, lastUser } = candidate;
    let state = candidate.state;
    const stepIndex = state.step;
    const strategy = FOLLOW_UP_STEPS[stepIndex];
    const attemptAt = new Date().toISOString();
    const ageMs = now.getTime() - new Date(lastUser.createdAt).getTime();
    const withinWindow = ageMs >= 0 && ageMs < SERVICE_WINDOW_MS;
    const sender = await getWhatsAppSender(lead.phone).catch(() => null);
    let delivered = false;
    let resultLabel = "";
    let transport: "freeform" | "template" | undefined;

    try {
      if (withinWindow) {
        const message = await generateFollowUp(lead, stepIndex, history);
        const sent = await sendWhatsAppText(lead.phone, message, sender?.phoneNumberId);
        await addMessage(lead.phone, "assistant", message, sent.messageId);
        await recordOutgoingMessageAccepted({ messageId: sent.messageId, phone: lead.phone }).catch(() => undefined);
        await recordFollowUpEvent({
          phone: lead.phone,
          anchorUserAt: state.anchorUserAt,
          step: stepIndex + 1,
          strategy: strategy.strategy,
          transport: "freeform",
          messageId: sent.messageId,
          sentAt: attemptAt
        });
        delivered = true;
        transport = "freeform";
        resultLabel = "sent_freeform";
      } else {
        const template = templateConfig(stepIndex);
        if (!template) {
          resultLabel = "template_required";
        } else {
          const sent = await sendWhatsAppFollowUpTemplate(lead.phone, {
            templateName: template.name,
            languageCode: template.language,
            phoneNumberIdOverride: sender?.phoneNumberId
          });
          const auditText = `[Follow-up ${stepIndex + 1}: ${strategy.label} · approved WhatsApp template ${template.name}]`;
          await addMessage(lead.phone, "assistant", auditText, sent.messageId);
          await recordOutgoingMessageAccepted({ messageId: sent.messageId, phone: lead.phone }).catch(() => undefined);
          await recordFollowUpEvent({
            phone: lead.phone,
            anchorUserAt: state.anchorUserAt,
            step: stepIndex + 1,
            strategy: strategy.strategy,
            transport: "template",
            templateName: template.name,
            messageId: sent.messageId,
            sentAt: attemptAt
          });
          delivered = true;
          transport = "template";
          resultLabel = "sent_template";
        }
      }
    } catch (error) {
      resultLabel = "send_failed";
      console.error("Automated follow-up failed", { phoneSuffix: lead.phone.slice(-4), step: stepIndex + 1, strategy: strategy.strategy, error });
    }

    if (delivered) {
      state = {
        ...state,
        step: state.step + 1,
        lastSentAt: attemptAt,
        lastAttemptAt: attemptAt,
        lastResult: resultLabel
      };
      await saveState(state);
      const next = computeFollowUpDue({
        anchorUserAt: state.anchorUserAt,
        step: state.step,
        lastSentAt: state.lastSentAt,
        lead
      });
      await updateLead(lead.phone, { followUpAt: next ? next.toISOString() : null }).catch(() => undefined);
    } else {
      state = { ...state, lastAttemptAt: attemptAt, lastResult: resultLabel };
      await saveState(state);
    }

    results.push({
      phoneSuffix: lead.phone.slice(-4),
      step: stepIndex + 1,
      status: resultLabel,
      strategy: strategy.strategy,
      transport
    });
  }

  return {
    checked: whatsappLeads.length,
    eligible,
    due: candidates.length,
    processed: Math.min(candidates.length, MAX_PER_RUN),
    results,
    performance: await getFollowUpPerformance()
  };
}
