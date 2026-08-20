import { getConversation, getOrCreateLead, updateLead } from "@/lib/store";
import type { ConversationMessage, Lead, LeadPatch } from "@/lib/types";

type ConversationSnippet = Pick<ConversationMessage, "role" | "content">;
type ExpectedAnswer = "deadline" | "programme" | "format" | "scope" | null;

const DURATION_ONLY = /^\s*(?:(?:about|around|roughly|approximately)\s+)?\d+\s*(?:hours?|days?|weeks?|months?)\s*$/i;
const DATE_ONLY = /^\s*(?:\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{1,2}(?:,?\s+\d{4})?|\s+\d{4}))\s*$/i;
const DEADLINE_IN_SENTENCE = /\b(?:deadline|due|submit|submission|need(?:ed)?\s+(?:it\s+)?by|complete(?:d)?\s+by|finish(?:ed)?\s+by|by\s+(?:the\s+)?(?:end|start|middle)|asap|urgent|tomorrow|today|this\s+week|next\s+week|next\s+month|within\s+\d+\s*(?:hours?|days?|weeks?|months?))\b/i;
const PROGRAMME_LEVEL = /\b(?:phd|doctorate|doctoral|masters?|master['’]?s|msc|mph|ma\b|mmed|postgraduate|post-graduate|undergraduate|bachelor['’]?s|degree|diploma|mbchb|medicine|medical|nursing|pharmacy|public health|business|education|law|engineering|mba)\b/i;
const FORMAT = /\b(theory|osce|both)\b/i;
const QUESTION_WORDS = /\b(?:how|what|when|where|why|can|could|would|should|price|cost|fee|quotation|quote|payment|pay)\b/i;

function previousAssistantQuestion(history: ConversationSnippet[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.role !== "assistant") continue;
    const text = message.content.trim();
    if (text.includes("?")) return text;
  }
  return null;
}

function expectedAnswer(question: string | null): ExpectedAnswer {
  const text = String(question || "").toLowerCase();
  if (!text) return null;
  if (/\b(deadline|due|submit|submission|timeframe|timing)\b/.test(text) || /\bwhen\b.{0,70}\b(?:need|want|complete|finish|submit)\b/.test(text)) return "deadline";
  if (/\b(programme|program|academic level|level of study|course of study|qualification)\b/.test(text)) return "programme";
  if (/\b(theory|osce)\b/.test(text)) return "format";
  if (/\bwhat\b.{0,80}\b(?:need|help|handle|work|system|website|automation|outcome|do for you)\b/.test(text)) return "scope";
  return null;
}

export function looksLikeNaturalDeadline(text: string, contextExpected = false) {
  const clean = text.trim();
  if (!clean || clean.includes("?")) return false;
  if (DURATION_ONLY.test(clean) || DATE_ONLY.test(clean)) return contextExpected;
  return DEADLINE_IN_SENTENCE.test(clean);
}

export function looksLikeNaturalProgramme(text: string) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean || clean.includes("?") || clean.length > 120) return false;
  if (DURATION_ONLY.test(clean) || DATE_ONLY.test(clean)) return false;
  if (PROGRAMME_LEVEL.test(clean)) return true;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 8 || QUESTION_WORDS.test(clean)) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N}\s&.,'’()/-]{1,100}$/u.test(clean);
}

function normalizeProgramme(text: string) {
  if (/\b(phd|doctorate|doctoral)\b/i.test(text)) return "PhD/Doctoral";
  if (/\b(masters?|master['’]?s|msc|mph|ma\b|mmed|postgraduate|post-graduate)\b/i.test(text)) return "Master's/Postgraduate";
  if (/\b(undergraduate|bachelor['’]?s|degree|mbchb)\b/i.test(text)) return "Undergraduate/Bachelor's";
  if (/\bdiploma\b/i.test(text)) return "Diploma";
  return text.trim().replace(/\s+/g, " ").slice(0, 180);
}

function deadlineValue(text: string) {
  return text.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function inferNaturalConversationFacts(
  history: ConversationSnippet[],
  clientText: string,
  lead: Pick<Lead, "programme" | "deadline" | "packageName">
): LeadPatch {
  const clean = clientText.trim();
  if (!clean) return {};
  const expected = expectedAnswer(previousAssistantQuestion(history));
  const patch: LeadPatch = {};

  if (!lead.deadline && looksLikeNaturalDeadline(clean, expected === "deadline")) {
    patch.deadline = deadlineValue(clean);
  }

  if (!lead.programme && ((expected === "programme" && looksLikeNaturalProgramme(clean)) || PROGRAMME_LEVEL.test(clean))) {
    patch.programme = normalizeProgramme(clean);
  }

  if (!lead.packageName && expected === "format") {
    const match = clean.match(FORMAT)?.[0]?.toLowerCase();
    if (match === "both") patch.packageName = "Theory + OSCE";
    else if (match === "theory") patch.packageName = "Theory";
    else if (match === "osce") patch.packageName = "OSCE";
  }

  return patch;
}

export async function captureNaturalConversationFacts(phone: string, clientText: string, source: "whatsapp" | "simulator") {
  const [lead, history] = await Promise.all([
    getOrCreateLead(phone, source),
    getConversation(phone, 48).catch(() => [])
  ]);
  const patch = inferNaturalConversationFacts(history, clientText, lead);
  if (!Object.keys(patch).length) return lead;
  return updateLead(phone, patch).catch(() => lead);
}
