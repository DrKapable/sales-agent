import { getConversation, getOrCreateLead, updateLead } from "@/lib/store";
import type { Lead, LeadPatch, LeadPriority, LeadStatus } from "@/lib/types";

export type SalesObjection = "price" | "trust" | "timing" | null;

export type SalesTurnAnalysis = {
  inferredService: string | null;
  serviceNeed: boolean;
  priceIntent: boolean;
  quoteIntent: boolean;
  paymentIntent: boolean;
  paymentConfirmation: boolean;
  proceedIntent: boolean;
  objection: SalesObjection;
  detailedRequest: boolean;
  closerAttention: boolean;
};

export type ConversationOptimization = {
  lead: Lead;
  analysis: SalesTurnAnalysis;
  clientMessageCount: number;
  closerReason: string | null;
  recentAssistantReplies: string[];
};

const SELF_DIRECTED = /\b(?:do|write|work on|complete|finish)\s+(?:it|the proposal|my proposal|the research|my research|the work|my work)?\s*myself\b|\bi want to (?:do|write|work on|complete|finish)\b.{0,35}\bmyself\b/i;
const COURSE_INTENT = /\b(course|training|class|modules?|certificate|enrol|enroll|self[- ]?paced|ai[- ]?(?:assisted|enhanced).*proposal|learn.*research|do it myself|write it myself|work on it myself|complete it myself)\b/i;
const RESEARCH_TERMS = /\b(proposal|dissertation|thesis|research|methodology|literature review|data analysis|statistical analysis|qualitative analysis|mixed methods|questionnaire|data collection tool|chapter\s*[1-6]|results|discussion|editing|proofread|referencing)\b/i;
const HANDS_ON = /\b(help|assist|support|do|write|develop|prepare|review|edit|analyse|analyze|fix|work on|complete)\b/i;
const PRICE_INTENT = /\b(how much|price|pricing|cost|fee|fees|charge|charges|rate)\b/i;
const PRICE_OBJECTION = /\b(expensive|too much|too costly|costly|can't afford|cannot afford|affordability|reduce the price|lower the price|discount)\b/i;
const QUOTE_INTENT = /\b(quotation|quote|proforma|pro-forma|invoice)\b/i;
const PAYMENT_CONFIRMATION = /\b(i\s*(?:have|'ve)\s*paid|paid already|payment (?:is )?done|made (?:the )?payment|sent (?:the )?(?:proof|receipt)|proof of payment|transaction (?:id|reference)|payment confirmation)\b/i;
const PAYMENT_INTENT = /\b(how (?:do|can) i pay|where (?:do|can) i pay|payment details|send (?:me )?(?:the )?payment|ready to pay|want to pay|i can pay|pay now|make payment|payment number)\b/i;
const PROCEED_INTENT = /\b(i want to proceed|i(?:'|’)m ready|go ahead|let(?:'|’)s proceed|let(?:'|’)s start|start (?:it|now|the work)|sign me up|enrol me|enroll me|i want (?:this|it)|book (?:it|me)|how do we start|what(?:'|’)s the next step)\b/i;
const TRUST_OBJECTION = /\b(is (?:this|medminds) (?:legit|genuine|real)|legit|genuine|scam|trust|trusted|reviews?|where are you located|physical (?:office|address)|official website|proof you are real)\b/i;
const TIMING_OBJECTION = /\b(i(?:'|’)ll think|let me think|think about it|come back later|maybe later|not now|next month|next week|i will get back|i(?:'|’)ll get back|need some time)\b/i;
const DETAILED_REQUEST = /\b(explain in detail|more detail|full details|everything included|what (?:exactly )?is included|all (?:the )?features|list (?:the )?modules|course outline|breakdown|compare|difference between)\b/i;

const STATUS_STAGE: Partial<Record<LeadStatus, number>> = {
  "NEW LEAD": 0,
  QUALIFIED: 1,
  INTERESTED: 2,
  "PAYMENT PENDING": 3
};

const PRIORITY_STAGE: Record<LeadPriority, number> = { STANDARD: 0, WARM: 1, HOT: 2 };
const CLOSER = "Dr Kanyembo Ng'andwe";

function inferProgramme(text: string) {
  if (/\b(?:masters?|master['’]?s|msc|mph|ma\b|postgraduate|post-graduate)\b/i.test(text)) return "Master's/Postgraduate";
  if (/\b(?:phd|doctorate|doctoral)\b/i.test(text)) return "PhD/Doctoral";
  if (/\b(?:undergraduate|bachelor['’]?s|degree|mbchb)\b/i.test(text)) return "Undergraduate";
  if (/\b(?:diploma)\b/i.test(text)) return "Diploma";
  return null;
}

function inferService(text: string) {
  const research = RESEARCH_TERMS.test(text);
  if (SELF_DIRECTED.test(text)) return "AI-Assisted Research Proposal Writing";
  if (COURSE_INTENT.test(text)) return "AI-Assisted Research Proposal Writing";
  if (research && HANDS_ON.test(text)) return "Research support";
  if (research) return "Research support";
  return null;
}

export function classifySalesTurn(text: string, lead?: Pick<Lead, "status" | "serviceInterest" | "packageName"> | null): SalesTurnAnalysis {
  const clean = text.trim();
  const inferredService = inferService(clean);
  const priceIntent = PRICE_INTENT.test(clean) && !PRICE_OBJECTION.test(clean);
  const quoteIntent = QUOTE_INTENT.test(clean);
  const paymentConfirmation = PAYMENT_CONFIRMATION.test(clean);
  const paymentIntent = PAYMENT_INTENT.test(clean) && !paymentConfirmation;
  const proceedIntent = PROCEED_INTENT.test(clean);
  const objection: SalesObjection = PRICE_OBJECTION.test(clean)
    ? "price"
    : TRUST_OBJECTION.test(clean)
      ? "trust"
      : TIMING_OBJECTION.test(clean)
        ? "timing"
        : null;
  const serviceNeed = Boolean(inferredService || lead?.serviceInterest || lead?.packageName);
  const engaged = Boolean(serviceNeed || ["QUALIFIED", "INTERESTED", "PAYMENT PENDING"].includes(lead?.status || ""));
  const closerAttention = !paymentConfirmation && (
    paymentIntent || quoteIntent || proceedIntent || ((objection === "price" || objection === "trust") && engaged)
  );

  return {
    inferredService,
    serviceNeed,
    priceIntent,
    quoteIntent,
    paymentIntent,
    paymentConfirmation,
    proceedIntent,
    objection,
    detailedRequest: DETAILED_REQUEST.test(clean),
    closerAttention
  };
}

function nextStatus(current: LeadStatus, analysis: SalesTurnAnalysis): LeadStatus {
  if (["CONVERTED", "LOST LEAD", "HUMAN ASSISTANCE REQUIRED"].includes(current)) return current;
  if (analysis.objection === "timing") return "FOLLOW-UP REQUIRED";
  if (analysis.paymentIntent || analysis.paymentConfirmation) return "PAYMENT PENDING";
  if (analysis.quoteIntent || analysis.proceedIntent || analysis.priceIntent) return "INTERESTED";
  if (analysis.inferredService) {
    if (current === "FOLLOW-UP REQUIRED") return "QUALIFIED";
    const currentStage = STATUS_STAGE[current] ?? 0;
    return currentStage < (STATUS_STAGE.QUALIFIED ?? 1) ? "QUALIFIED" : current;
  }
  return current;
}

function nextPriority(current: LeadPriority, analysis: SalesTurnAnalysis): LeadPriority {
  let target: LeadPriority = "STANDARD";
  if (analysis.closerAttention || analysis.paymentConfirmation) target = "HOT";
  else if (analysis.priceIntent || analysis.serviceNeed || analysis.objection) target = "WARM";
  return PRIORITY_STAGE[target] > PRIORITY_STAGE[current] ? target : current;
}

function followUpTime(text: string) {
  const lower = text.toLowerCase();
  const hours = /tomorrow/.test(lower) ? 24 : /next week/.test(lower) ? 7 * 24 : 3 * 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function shouldReplaceService(current: string | null, inferred: string | null, text: string) {
  if (!inferred) return false;
  if (!current || current === "Research enquiry" || current === "Service not established") return true;
  if (current === inferred) return false;
  if (SELF_DIRECTED.test(text)) return inferred === "AI-Assisted Research Proposal Writing";
  if (inferred === "Research support" && HANDS_ON.test(text) && !SELF_DIRECTED.test(text)) return true;
  if (inferred === "AI-Assisted Research Proposal Writing" && COURSE_INTENT.test(text)) return true;
  return false;
}

export async function optimizeInboundLead(phone: string, text: string, source: "whatsapp" | "simulator"): Promise<ConversationOptimization> {
  let lead = await getOrCreateLead(phone, source);
  const history = await getConversation(phone, 48).catch(() => []);
  const analysis = classifySalesTurn(text, lead);
  const clientMessageCount = history.filter((message) => message.role === "user").length;
  const recentAssistantReplies = history
    .filter((message) => message.role === "assistant")
    .slice(-6)
    .map((message) => message.content);

  if (!["CONVERTED", "LOST LEAD", "HUMAN ASSISTANCE REQUIRED"].includes(lead.status)) {
    const patch: LeadPatch = {};
    const status = nextStatus(lead.status, analysis);
    const priority = nextPriority(lead.priority, analysis);
    const programme = lead.programme ? null : inferProgramme(text);
    if (status !== lead.status) patch.status = status;
    if (priority !== lead.priority) patch.priority = priority;
    if (shouldReplaceService(lead.serviceInterest, analysis.inferredService, text)) patch.serviceInterest = analysis.inferredService;
    if (programme) patch.programme = programme;

    if (analysis.objection === "timing") {
      patch.followUpAt = followUpTime(text);
    } else if (lead.status === "FOLLOW-UP REQUIRED" && status !== "FOLLOW-UP REQUIRED") {
      patch.followUpAt = null;
    }

    if (analysis.closerAttention && !lead.assignedTo) patch.assignedTo = CLOSER;
    if (Object.keys(patch).length) lead = await updateLead(phone, patch);
  }

  const closerReason = analysis.closerAttention
    ? analysis.objection === "price"
      ? "Engaged client raised a price objection."
      : analysis.objection === "trust"
        ? "Engaged client raised a trust concern."
        : analysis.paymentIntent
          ? "Client is asking how to pay."
          : analysis.quoteIntent
            ? "Client requested a quotation or invoice."
            : analysis.proceedIntent
              ? "Client expressed clear intent to proceed."
              : "High-intent sales lead."
    : null;

  return { lead, analysis, clientMessageCount, closerReason, recentAssistantReplies };
}

function enforceSingleQuestion(text: string) {
  const positions: number[] = [];
  for (let index = 0; index < text.length; index += 1) if (text[index] === "?") positions.push(index);
  if (positions.length <= 1) return text;
  const keep = positions.at(-1);
  return [...text].map((character, index) => character === "?" && index !== keep ? "." : character).join("");
}

function compactSentences(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  const parts = text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return text;

  const question = [...parts].reverse().find((part) => part.includes("?"));
  const selected: string[] = [];
  let length = 0;
  for (const part of parts) {
    const addition = (selected.length ? 1 : 0) + part.length;
    if (selected.length && length + addition > maxLength - (question && !selected.includes(question) ? Math.min(question.length + 1, 180) : 0)) break;
    selected.push(part);
    length += addition;
    if (length >= maxLength * 0.72) break;
  }
  if (question && !selected.includes(question) && selected.join(" ").length + question.length + 1 <= maxLength) selected.push(question);
  return selected.join(" ") || text;
}

const ACKNOWLEDGEMENT_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "that helps", pattern: /^(?:thanks[,!]?\s*)?(?:got it[,!]?\s*)?that helps[.!,:]?\s*/i },
  { key: "thanks", pattern: /^(?:thanks|thank you)(?:\s+for\s+[^.!?]{1,80})?[.!,:]?\s*/i },
  { key: "got it", pattern: /^got it[.!,:]?\s*/i },
  { key: "great", pattern: /^great[.!,:]?\s*/i },
  { key: "absolutely", pattern: /^absolutely[.!,:]?\s*/i },
  { key: "okay", pattern: /^(?:okay|ok)[.!,:]?\s*/i },
  { key: "makes sense", pattern: /^(?:that )?makes sense[.!,:]?\s*/i },
  { key: "understood", pattern: /^understood[.!,:]?\s*/i }
];

function acknowledgementKey(text: string) {
  return ACKNOWLEDGEMENT_PATTERNS.find(({ pattern }) => pattern.test(text.trim()))?.key ?? null;
}

function stripRepeatedAcknowledgement(text: string, recentAssistantReplies: string[]) {
  const key = acknowledgementKey(text);
  if (!key) return text;
  const recentKeys = new Set(recentAssistantReplies.map(acknowledgementKey).filter(Boolean));
  if (!recentKeys.has(key)) return text;
  const pattern = ACKNOWLEDGEMENT_PATTERNS.find((item) => item.key === key)?.pattern;
  if (!pattern) return text;
  const stripped = text.replace(pattern, "").trim();
  if (!stripped) return text;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

export function shapeMaryReply(
  reply: string,
  clientText: string,
  analysis: SalesTurnAnalysis,
  recentAssistantReplies: string[] = []
) {
  let shaped = reply.trim().replaceAll("—", ",");
  shaped = stripRepeatedAcknowledgement(shaped, recentAssistantReplies);
  shaped = enforceSingleQuestion(shaped);

  const containsCriticalInstructions = /https?:\/\//i.test(shaped) || analysis.paymentIntent || analysis.paymentConfirmation;
  const maxLength = analysis.detailedRequest ? 1100 : containsCriticalInstructions ? 900 : analysis.objection ? 520 : 650;
  if (!analysis.detailedRequest || shaped.length > 1400) shaped = compactSentences(shaped, maxLength);

  // A routine short client message should not trigger an essay, even if the model tries to over-answer.
  if (clientText.trim().length <= 180 && !analysis.detailedRequest && shaped.length > maxLength) {
    shaped = compactSentences(shaped, maxLength);
  }
  return enforceSingleQuestion(shaped).trim();
}
