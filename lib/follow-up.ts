import { gateway, ToolLoopAgent } from "ai";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt";
import { getAiModelCandidates } from "@/lib/env";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { getConversation, listLeads, updateLead, addMessage } from "@/lib/store";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { getWhatsAppSender } from "@/lib/whatsapp-sender-context";
import { followUpTemplateConfig, sendWhatsAppFollowUpTemplate } from "@/lib/whatsapp-template";
import type { Lead } from "@/lib/types";

const FOLLOW_UP_STEPS = 4;
const MAX_PER_RUN = 25;
const HOUR_MS = 60 * 60 * 1000;
const STOP_STATUSES = new Set(["CONVERTED", "LOST LEAD", "HUMAN ASSISTANCE REQUIRED"]);
const OPT_OUT = /\b(stop|unsubscribe|do not contact|don't contact|dont contact|no more messages|not interested|leave me alone)\b/i;

type FollowUpState = {
  phone: string;
  anchorUserAt: string;
  step: number;
  lastSentAt: string | null;
  lastAttemptAt: string | null;
  lastResult: string | null;
};

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureTable() {
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
  })();
  await initialized;
}

async function getState(phone: string): Promise<FollowUpState | null> {
  await ensureTable();
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
  await ensureTable();
  const db = database();
  if (!db) return;
  await db.query(`INSERT INTO lead_follow_up_state (phone, anchor_user_at, step, last_sent_at, last_attempt_at, last_result, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (phone) DO UPDATE SET anchor_user_at=$2,step=$3,last_sent_at=$4,last_attempt_at=$5,last_result=$6,updated_at=NOW()`,
    [state.phone, state.anchorUserAt, state.step, state.lastSentAt, state.lastAttemptAt, state.lastResult]);
}

function delayHours(lead: Lead, step: number) {
  if (step === 0) return lead.status === "PAYMENT PENDING" || lead.priority === "HOT" ? 8 : 12;
  if (step === 1) return 72;
  if (step === 2) return 168;
  if (step === 3) return 336;
  return null;
}

function nextDue(lead: Lead, anchorUserAt: string, step: number) {
  const hours = delayHours(lead, step);
  if (hours == null) return null;
  const due = new Date(new Date(anchorUserAt).getTime() + hours * HOUR_MS);

  // If the client explicitly asked to be contacted later, preserve that timing.
  if (lead.status === "FOLLOW-UP REQUIRED" && lead.followUpAt) {
    const requested = new Date(lead.followUpAt);
    if (Number.isFinite(requested.getTime()) && requested.getTime() > due.getTime()) return requested;
  }
  return due;
}

function isEligible(lead: Lead) {
  return lead.source === "whatsapp" && !lead.aiPaused && !STOP_STATUSES.has(lead.status);
}

function rankLead(lead: Lead) {
  const priority = lead.priority === "HOT" ? 30 : lead.priority === "WARM" ? 20 : 10;
  const status = lead.status === "PAYMENT PENDING" ? 40 : lead.status === "INTERESTED" ? 30 : lead.status === "QUALIFIED" ? 20 : 10;
  return priority + status;
}

function retryBlocked(state: FollowUpState, now: Date) {
  if (!state.lastAttemptAt || !state.lastResult) return false;
  const age = now.getTime() - new Date(state.lastAttemptAt).getTime();
  if (state.lastResult === "send_failed") return age < 4 * HOUR_MS;
  if (state.lastResult === "template_required") return age < 20 * HOUR_MS;
  return false;
}

function simpleFallback(lead: Lead, step: number) {
  const name = lead.name?.trim().split(/\s+/)[0];
  const hello = name ? `Hi ${name},` : "Hi,";
  const service = lead.serviceInterest || lead.packageName || "your MedMinds enquiry";

  if (step === 0) {
    if (lead.status === "PAYMENT PENDING") return `${hello} you were at the payment step for ${service}. If anything blocked you, I can help you pick up from there. Were you able to complete the payment?`;
    return `${hello} you were looking into ${service}. If that is still something you want to move forward with, I can continue from where we stopped. Are you still working on it?`;
  }
  if (step === 1) return `${hello} I’m following up on ${service}. If price, trust, or the next step is what is holding things up, tell me the one concern and I’ll address it directly.`;
  if (step === 2 && lead.deadline) return `${hello} you mentioned a deadline around ${lead.deadline} for ${service}. If that still applies, we can focus only on the next practical step. Would you like to continue?`;
  if (step === 2) return `${hello} a quick check on ${service}. If it is still relevant, I can help you choose the simplest next step without going through everything again. Would you like to continue?`;
  return `${hello} I’ll close the loop on ${service} for now so I don’t keep messaging you. If you decide to continue later, just reply here and we’ll pick up from where we stopped.`;
}

function shapeFollowUp(text: string, finalStep: boolean) {
  let value = text.trim().replaceAll("—", ",");
  const questionMarks = [...value].reduce<number[]>((positions, char, index) => {
    if (char === "?") positions.push(index);
    return positions;
  }, []);
  if (questionMarks.length > 1) {
    const keep = questionMarks.at(-1);
    value = [...value].map((char, index) => char === "?" && index !== keep ? "." : char).join("");
  }
  if (!finalStep && value.length > 650) {
    const parts = value.split(/(?<=[.!?])\s+|\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const selected: string[] = [];
    for (const part of parts) {
      if (selected.length && `${selected.join(" ")} ${part}`.length > 650) break;
      selected.push(part);
      if (selected.length >= 3) break;
    }
    if (selected.length) value = selected.join(" ");
  }
  return value.trim();
}

function followUpFocus(lead: Lead, step: number) {
  if (step === 0) return "Make the client's own stated goal or unresolved task the first thing they notice. Gently use consistency by referring to what they already said they wanted, then offer one easy next step.";
  if (step === 1) return "Reduce uncertainty. If trust is the concern, offer one verified credibility cue such as the official MedMinds website, Google reviews, CMS workflow or a formal quotation. If price is the concern, address only the approved payment structure. Never invent ratings, testimonials, client counts or discounts.";
  if (step === 2 && lead.deadline) return `The client previously gave this deadline: ${lead.deadline}. You may make that real deadline salient as a planning consideration, but do not create artificial urgency or scarcity.`;
  if (step === 2) return "Reconnect the service to the client's own goal and make the next step easy. Do not manufacture urgency or scarcity.";
  return "Respect autonomy. This is the final check-in. Close the loop politely, do not pressure the client, and make it clear they can return later.";
}

async function generateFollowUp(lead: Lead, step: number) {
  const history = await getConversation(lead.phone, 18);
  const transcript = history.map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`).join("\n");
  const instructions = `${SALES_AGENT_PROMPT}\n\nAUTOMATED FOLLOW-UP\n- This is follow-up ${step + 1} of at most ${FOLLOW_UP_STEPS}, not a new conversation.\n- ${followUpFocus(lead, step)}\n- Use pre-suasion ethically: focus attention on the client's existing goal, concern or prior commitment before asking for a next action.\n- Reciprocity: where useful, offer one small helpful next step before asking for commitment.\n- Authority/social proof: use only verified MedMinds credibility cues. Never invent popularity, testimonials, ratings, client numbers or outcomes.\n- Consistency: refer only to what the client actually said or requested. Never guilt them for not replying.\n- Scarcity: never fabricate limited spaces, deadlines, promotions or urgency.\n- Keep it to 1-3 short sentences and at most one question.\n- Do not use 'just checking in' as the main value of the message and do not say this is automated.`;

  let lastError: unknown = null;
  for (const model of getAiModelCandidates()) {
    try {
      const agent = new ToolLoopAgent({ model: gateway(model), instructions });
      const result = await agent.generate({ prompt: `Lead: ${JSON.stringify({ name: lead.name, serviceInterest: lead.serviceInterest, programme: lead.programme, deadline: lead.deadline, status: lead.status, priority: lead.priority })}\n\nRecent conversation:\n${transcript}\n\nWrite only the WhatsApp follow-up message.` });
      const text = shapeFollowUp(result.text, step === FOLLOW_UP_STEPS - 1);
      if (text) return text;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn("Follow-up AI generation failed; using safe fallback", { phoneSuffix: lead.phone.slice(-4), step: step + 1, error: lastError });
  return simpleFallback(lead, step);
}

export async function runAutomatedFollowUps() {
  const leads = (await listLeads()).filter(isEligible).sort((a, b) => rankLead(b) - rankLead(a));
  const now = new Date();
  const results: Array<{ phoneSuffix: string; step: number; status: string }> = [];
  let checked = 0;

  for (const lead of leads) {
    if (checked >= MAX_PER_RUN) break;
    const history = await getConversation(lead.phone, 40);
    const lastUser = [...history].reverse().find((message) => message.role === "user");
    if (!lastUser) continue;

    if (OPT_OUT.test(lastUser.content)) {
      await saveState({ phone: lead.phone, anchorUserAt: lastUser.createdAt, step: FOLLOW_UP_STEPS, lastSentAt: null, lastAttemptAt: new Date().toISOString(), lastResult: "opted_out" });
      results.push({ phoneSuffix: lead.phone.slice(-4), step: 0, status: "opted_out" });
      continue;
    }

    let state = await getState(lead.phone);
    if (!state || state.anchorUserAt !== lastUser.createdAt) {
      state = { phone: lead.phone, anchorUserAt: lastUser.createdAt, step: 0, lastSentAt: null, lastAttemptAt: null, lastResult: "reset_on_client_message" };
      await saveState(state);
    }
    if (state.step >= FOLLOW_UP_STEPS) continue;

    const due = nextDue(lead, state.anchorUserAt, state.step);
    if (!due) continue;
    await updateLead(lead.phone, { followUpAt: due.toISOString() });
    if (due.getTime() > now.getTime() || retryBlocked(state, now)) continue;

    checked += 1;
    const withinWindow = now.getTime() - new Date(lastUser.createdAt).getTime() < 24 * HOUR_MS;
    const attemptAt = new Date().toISOString();
    let delivered = false;
    let resultLabel = "";

    try {
      const sender = await getWhatsAppSender(lead.phone);
      if (withinWindow) {
        const message = await generateFollowUp(lead, state.step);
        const sent = await sendWhatsAppText(lead.phone, message, sender?.phoneNumberId);
        await addMessage(lead.phone, "assistant", message, sent.messageId);
        await recordOutgoingMessageAccepted({ messageId: sent.messageId, phone: lead.phone }).catch(() => undefined);
        delivered = true;
        resultLabel = "sent_freeform";
      } else {
        const template = followUpTemplateConfig(state.step);
        if (!template.name) {
          resultLabel = "template_required";
        } else {
          const sent = await sendWhatsAppFollowUpTemplate(lead.phone, state.step, sender?.phoneNumberId);
          await addMessage(lead.phone, "assistant", `[Automated follow-up ${state.step + 1} sent using approved WhatsApp template: ${sent.templateName}]`, sent.messageId);
          await recordOutgoingMessageAccepted({ messageId: sent.messageId, phone: lead.phone }).catch(() => undefined);
          delivered = true;
          resultLabel = "sent_template";
        }
      }
    } catch (error) {
      resultLabel = "send_failed";
      console.error("Automated follow-up failed", { phoneSuffix: lead.phone.slice(-4), step: state.step + 1, error });
    }

    if (delivered) {
      state = { ...state, step: state.step + 1, lastSentAt: attemptAt, lastAttemptAt: attemptAt, lastResult: resultLabel };
      await saveState(state);
      const next = nextDue(lead, state.anchorUserAt, state.step);
      await updateLead(lead.phone, { followUpAt: next ? next.toISOString() : null });
    } else {
      state = { ...state, lastAttemptAt: attemptAt, lastResult: resultLabel };
      await saveState(state);
    }
    results.push({ phoneSuffix: lead.phone.slice(-4), step: state.step, status: resultLabel });
  }

  return {
    checked,
    eligible: leads.length,
    sequence: "8-12h, 3d, 7d, 14d",
    maxSteps: FOLLOW_UP_STEPS,
    templateConfigured: Boolean(followUpTemplateConfig(0).name),
    results
  };
}
