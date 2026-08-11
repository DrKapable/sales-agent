import { gateway, ToolLoopAgent } from "ai";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt";
import { getAiModelCandidates } from "@/lib/env";
import { getConversation, listLeads, updateLead, addMessage } from "@/lib/store";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendWhatsAppFollowUpTemplate } from "@/lib/whatsapp-template";
import type { Lead } from "@/lib/types";

const FOLLOW_UP_DAYS = [1, 3, 7, 14, 21] as const;
const MAX_PER_RUN = 25;
const STOP_STATUSES = new Set(["CONVERTED", "LOST LEAD", "HUMAN ASSISTANCE REQUIRED"]);
const OPT_OUT = /\b(stop|unsubscribe|do not contact|don't contact|dont contact|no more messages|not interested|leave me alone)\b/i;

type FollowUpState = { phone: string; anchorUserAt: string; step: number; lastSentAt: string | null; lastResult: string | null };

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
  initialized ??= db.query(`CREATE TABLE IF NOT EXISTS lead_follow_up_state (
    phone TEXT PRIMARY KEY,
    anchor_user_at TIMESTAMPTZ NOT NULL,
    step INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMPTZ,
    last_result TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).then(() => undefined);
  await initialized;
}

async function getState(phone: string): Promise<FollowUpState | null> {
  await ensureTable();
  const db = database();
  if (!db) return null;
  const rows = await db.query(`SELECT phone, anchor_user_at, step, last_sent_at, last_result FROM lead_follow_up_state WHERE phone=$1`, [phone]);
  if (!rows.length) return null;
  const row = rows[0];
  return {
    phone: String(row.phone),
    anchorUserAt: new Date(String(row.anchor_user_at)).toISOString(),
    step: Number(row.step),
    lastSentAt: row.last_sent_at ? new Date(String(row.last_sent_at)).toISOString() : null,
    lastResult: row.last_result ? String(row.last_result) : null
  };
}

async function saveState(state: FollowUpState) {
  await ensureTable();
  const db = database();
  if (!db) return;
  await db.query(`INSERT INTO lead_follow_up_state (phone, anchor_user_at, step, last_sent_at, last_result, updated_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
    ON CONFLICT (phone) DO UPDATE SET anchor_user_at=$2,step=$3,last_sent_at=$4,last_result=$5,updated_at=NOW()`,
    [state.phone, state.anchorUserAt, state.step, state.lastSentAt, state.lastResult]);
}

function nextDue(anchorUserAt: string, step: number) {
  if (step >= FOLLOW_UP_DAYS.length) return null;
  const due = new Date(anchorUserAt);
  due.setUTCDate(due.getUTCDate() + FOLLOW_UP_DAYS[step]);
  return due;
}

function isEligible(lead: Lead) {
  return lead.source === "whatsapp" && !lead.aiPaused && !STOP_STATUSES.has(lead.status);
}

function simpleFallback(lead: Lead, step: number) {
  const name = lead.name?.split(/\s+/)[0];
  const service = lead.serviceInterest || lead.packageName;
  const intro = name ? `Hi ${name},` : "Hi,";
  if (step === 0) return `${intro} just checking in about ${service ? `your ${service} enquiry` : "your MedMinds enquiry"}. If you still need help, reply here and I’ll continue from where we left off.`;
  if (step === 1) return `${intro} are you still considering ${service || "the service you asked about"}? If anything is unclear, send me the question and I’ll help.`;
  if (step === 2) return `${intro} a quick follow-up on ${service || "your earlier enquiry"}. If timing or the right package is the issue, tell me what you need and I’ll point you in the right direction.`;
  if (step === 3) return `${intro} checking back once more about ${service || "your MedMinds enquiry"}. If you’d like to continue, just reply here.`;
  return `${intro} this is my final follow-up on ${service || "your earlier enquiry"}. If you still need help later, message MedMinds anytime and we’ll pick it up from there.`;
}

async function generateFollowUp(lead: Lead, step: number) {
  const history = await getConversation(lead.phone, 18);
  const transcript = history.map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`).join("\n");
  const instructions = `${SALES_AGENT_PROMPT}\n\nYou are writing automated follow-up number ${step + 1} of at most 5 for an unconverted lead. This is not a new conversation. Refer naturally to the unresolved service or question in the transcript. Keep it to 1-3 short sentences. Do not repeat a previous follow-up, do not pressure the client, do not invent urgency or discounts, and do not say this is automated. If this is follow-up 5, make it clear this is the final check-in and that the client can message again later.`;

  let lastError: unknown = null;
  for (const model of getAiModelCandidates()) {
    try {
      const agent = new ToolLoopAgent({ model: gateway(model), instructions });
      const result = await agent.generate({ prompt: `Lead: ${JSON.stringify({ name: lead.name, serviceInterest: lead.serviceInterest, programme: lead.programme, deadline: lead.deadline, status: lead.status })}\n\nRecent conversation:\n${transcript}\n\nWrite only the WhatsApp follow-up message.` });
      const text = result.text.trim().replaceAll("—", ",");
      if (text) return text;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn("Follow-up AI generation failed; using safe fallback", { phoneSuffix: lead.phone.slice(-4), step: step + 1, error: lastError });
  return simpleFallback(lead, step);
}

export async function runAutomatedFollowUps() {
  const leads = (await listLeads()).filter(isEligible);
  const now = new Date();
  const results: Array<{ phoneSuffix: string; step: number; status: string }> = [];

  for (const lead of leads.slice(0, MAX_PER_RUN)) {
    const history = await getConversation(lead.phone, 40);
    const lastUser = [...history].reverse().find((message) => message.role === "user");
    if (!lastUser) continue;
    if (OPT_OUT.test(lastUser.content)) {
      await saveState({ phone: lead.phone, anchorUserAt: lastUser.createdAt, step: FOLLOW_UP_DAYS.length, lastSentAt: null, lastResult: "opted_out" });
      results.push({ phoneSuffix: lead.phone.slice(-4), step: 0, status: "opted_out" });
      continue;
    }

    let state = await getState(lead.phone);
    if (!state || state.anchorUserAt !== lastUser.createdAt) {
      state = { phone: lead.phone, anchorUserAt: lastUser.createdAt, step: 0, lastSentAt: null, lastResult: "reset_on_client_message" };
      await saveState(state);
    }
    if (state.step >= FOLLOW_UP_DAYS.length) continue;

    const due = nextDue(state.anchorUserAt, state.step);
    if (!due) continue;
    await updateLead(lead.phone, { followUpAt: due.toISOString() });
    if (due.getTime() > now.getTime()) continue;

    const ageMs = now.getTime() - new Date(lastUser.createdAt).getTime();
    const withinWindow = ageMs < 24 * 60 * 60 * 1000;
    let delivered = false;
    let resultLabel = "";

    try {
      if (withinWindow) {
        const message = await generateFollowUp(lead, state.step);
        await sendWhatsAppText(lead.phone, message);
        await addMessage(lead.phone, "assistant", message);
        delivered = true;
        resultLabel = "sent_freeform";
      } else if (process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME) {
        await sendWhatsAppFollowUpTemplate(lead.phone);
        const auditText = `[Automated follow-up ${state.step + 1} sent using approved WhatsApp template: ${process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME}]`;
        await addMessage(lead.phone, "assistant", auditText);
        delivered = true;
        resultLabel = "sent_template";
      } else {
        resultLabel = "template_required";
      }
    } catch (error) {
      resultLabel = "send_failed";
      console.error("Automated follow-up failed", { phoneSuffix: lead.phone.slice(-4), step: state.step + 1, error });
    }

    if (delivered) {
      state = { ...state, step: state.step + 1, lastSentAt: new Date().toISOString(), lastResult: resultLabel };
      await saveState(state);
      const next = nextDue(state.anchorUserAt, state.step);
      await updateLead(lead.phone, { followUpAt: next ? next.toISOString() : null });
    } else {
      state = { ...state, lastResult: resultLabel };
      await saveState(state);
    }
    results.push({ phoneSuffix: lead.phone.slice(-4), step: state.step, status: resultLabel });
  }

  return { checked: Math.min(leads.length, MAX_PER_RUN), eligible: leads.length, results };
}
