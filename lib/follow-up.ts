import { gateway, ToolLoopAgent } from "ai";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt-kaunda";
import { classifySalesTurn, shapeMaryReply } from "@/lib/conversation-optimization";
import { getAiModelCandidates } from "@/lib/env";
import { buildFollowUpFallback, FOLLOW_UP_STEPS, followUpAngle, followUpDelayHours, leadFollowUpRank } from "@/lib/follow-up-strategy";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { getConversation, listLeads, updateLead, addMessage } from "@/lib/store";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { getWhatsAppSender } from "@/lib/whatsapp-sender-context";
import { followUpTemplateConfig, sendWhatsAppFollowUpTemplate } from "@/lib/whatsapp-template";
import type { Lead } from "@/lib/types";

const MAX_PER_RUN = 25;
const STOP_STATUSES = new Set(["CONVERTED", "LOST LEAD", "HUMAN ASSISTANCE REQUIRED"]);
const OPT_OUT = /\b(stop|unsubscribe|do not contact|don't contact|dont contact|no more messages|not interested|leave me alone)\b/i;
const HOUR_MS = 60 * 60 * 1000;

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

function sequenceDue(lead: Lead, anchorUserAt: string, step: number) {
  const hours = followUpDelayHours(lead, step);
  if (hours == null) return null;
  return new Date(new Date(anchorUserAt).getTime() + hours * HOUR_MS);
}

function dueForLead(lead: Lead, state: FollowUpState) {
  const sequence = sequenceDue(lead, state.anchorUserAt, state.step);
  if (!sequence) return null;

  // Respect an explicit timing follow-up created from the client's own request
  // (e.g. "next week") instead of overwriting it with the automated cadence.
  if (lead.status === "FOLLOW-UP REQUIRED" && lead.followUpAt) {
    const requested = new Date(lead.followUpAt);
    if (Number.isFinite(requested.getTime()) && requested.getTime() > sequence.getTime()) return requested;
  }
  return sequence;
}

function isEligible(lead: Lead) {
  return lead.source === "whatsapp" && !lead.aiPaused && !STOP_STATUSES.has(lead.status);
}

function retryBlocked(state: FollowUpState, now: Date) {
  if (!state.lastAttemptAt || !state.lastResult) return false;
  const age = now.getTime() - new Date(state.lastAttemptAt).getTime();
  if (state.lastResult === "send_failed") return age < 4 * HOUR_MS;
  if (state.lastResult === "template_required") return age < 20 * HOUR_MS;
  return false;
}

function principleInstruction(step: number, lead: Lead) {
  const angle = followUpAngle(step);
  if (angle === "goal") {
    return "Foreground the client's own stated goal or unresolved task. Use commitment/consistency gently by reminding them what they said they wanted, then offer one easy next step. Do not lead with MedMinds features.";
  }
  if (angle === "reduce_uncertainty") {
    return "Reduce uncertainty. If the transcript shows a trust concern, you may offer one verified credibility cue such as the official MedMinds website, Google reviews, CMS workflow or a formal quotation, but never invent ratings, testimonials or client counts. If price is the concern, address the approved payment structure briefly. Use one next step only.";
  }
  if (angle === "deadline_or_value") {
    return lead.deadline
      ? `Make the client's own stated deadline (${lead.deadline}) salient as a planning consideration, without creating artificial urgency or scarcity. Offer one practical next step.`
      : "Reconnect the service to the client's goal and make the next step easy. Do not manufacture urgency, scarcity or fear of missing out.";
  }
  return "Respect autonomy. State that this is the final check-in, avoid pressure, and leave the door open for the client to return later. Do not ask multiple questions.";
}

async function generateFollowUp(lead: Lead, step: number, history: Awaited<ReturnType<typeof getConversation>>) {
  const transcript = history.slice(-18).map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`).join("\n");
  const latestUser = [...history].reverse().find((message) => message.role === "user");
  const analysis = classifySalesTurn(latestUser?.content || "", lead);
  const instructions = `${SALES_AGENT_PROMPT}\n\nAUTOMATED FOLLOW-UP\n- You are writing follow-up ${step + 1} of at most ${FOLLOW_UP_STEPS} for an unconverted lead. This is a continuation, not a new sales pitch.\n- ${principleInstruction(step, lead)}\n- Pre-suasion rule: focus attention first on the client's own goal, concern or prior commitment before asking for the next action.\n- Reciprocity: where useful, offer one small helpful next step before asking for commitment.\n- Authority/social proof: use only verified MedMinds credibility cues. Never invent popularity, testimonials, ratings, client numbers or outcomes.\n- Consistency: refer to what the client actually said or requested; never guilt them for not replying.\n- Scarcity: never fabricate limited spaces, deadlines, discounts or urgency. You may mention only a deadline the client actually gave.\n- Keep it to 1-3 short sentences and at most one question.\n- Do not repeat a previous follow-up, do not say this is automated, and do not use "just checking in" as the main value of the message.\n- If this is the final follow-up, close the loop politely and say they can return later.`;

  let lastError: unknown = null;
  for (const model of getAiModelCandidates()) {
    try {
      const agent = new ToolLoopAgent({ model: gateway(model), instructions });
      const result = await agent.generate({
        prompt: `Lead: ${JSON.stringify({ name: lead.name, serviceInterest: lead.serviceInterest, programme: lead.programme, deadline: lead.deadline, status: lead.status, priority: lead.priority })}\n\nRecent conversation:\n${transcript}\n\nWrite only the WhatsApp follow-up message.`
      });
      const text = result.text.trim().replaceAll("—", ",");
      if (text) return shapeMaryReply(text, latestUser?.content || "", analysis);
    } catch (error) {
      lastError = error;
    }
  }
  console.warn("Follow-up AI generation failed; using safe fallback", { phoneSuffix: lead.phone.slice(-4), step: step + 1, error: lastError });
  return buildFollowUpFallback(lead, step);
}

export async function runAutomatedFollowUps() {
  const allEligible = (await listLeads()).filter(isEligible).sort((a, b) => leadFollowUpRank(b) - leadFollowUpRank(a));
  const now = new Date();
  const results: Array<{ phoneSuffix: string; step: number; status: string }> = [];
  let checked = 0;

  for (const lead of allEligible) {
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

    const due = dueForLead(lead, state);
    if (!due) continue;
    await updateLead(lead.phone, { followUpAt: due.toISOString() });
    if (due.getTime() > now.getTime() || retryBlocked(state, now)) continue;

    checked += 1;
    const ageMs = now.getTime() - new Date(lastUser.createdAt).getTime();
    const withinWindow = ageMs < 24 * HOUR_MS;
    let delivered = false;
    let resultLabel = "";
    const attemptAt = new Date().toISOString();

    try {
      const sender = await getWhatsAppSender(lead.phone);
      if (withinWindow) {
        const message = await generateFollowUp(lead, state.step, history);
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
          const auditText = `[Automated follow-up ${state.step + 1} sent using approved WhatsApp template: ${sent.templateName}]`;
          await addMessage(lead.phone, "assistant", auditText, sent.messageId);
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
      const next = dueForLead(lead, state);
      await updateLead(lead.phone, { followUpAt: next ? next.toISOString() : null });
    } else {
      state = { ...state, lastAttemptAt: attemptAt, lastResult: resultLabel };
      await saveState(state);
    }
    results.push({ phoneSuffix: lead.phone.slice(-4), step: state.step, status: resultLabel });
  }

  return {
    checked,
    eligible: allEligible.length,
    sequence: "8-12h, 3d, 7d, 14d",
    maxSteps: FOLLOW_UP_STEPS,
    templateConfigured: Boolean(followUpTemplateConfig(1).name || followUpTemplateConfig(0).name),
    results
  };
}
