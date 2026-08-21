import type { ConversationMessage, Lead } from "@/lib/types";

export type QualificationKind = "research" | "course" | "pa_gym" | "digital" | "other";
export type QualificationMissing = "need" | "path" | "programme" | "scope" | "format" | "deadline" | null;

export type LeadQualification = {
  commercialIntent: boolean;
  qualified: boolean;
  priorPriceContext: boolean;
  kind: QualificationKind;
  missing: QualificationMissing;
};

const COMMERCIAL_INTENT = /\b(how much|price|pricing|cost|fee|fees|charge|charges|rate|quotation|quote|proforma|pro-forma|invoice|payment details|how (?:do|can) i pay|where (?:do|can) i pay|ready to pay|pay now)\b/i;
const EXISTING_DOCUMENT_REQUEST = /\b(send|resend|share|download|copy)\b.{0,35}\b(my|the|prepared|existing)\b.{0,20}\b(quotation|quote|invoice)\b/i;
const PRICE_OBJECTION = /\b(expensive|too much|too costly|costly|can't afford|cannot afford|affordability|reduce the price|lower the price|discount)\b/i;
const PRICE_VALUE = /(?:\bK\s?\d[\d,]*(?:\.\d+)?\b|\bZMW\s?\d[\d,]*(?:\.\d+)?\b)/i;

const RESEARCH = /\b(proposal|dissertation|thesis|research|methodology|literature review|data analysis|statistical analysis|qualitative analysis|mixed methods|questionnaire|data collection tool|chapter\s*[1-6]|results|discussion|editing|proofread|referencing)\b/i;
const RESEARCH_SCOPE = /\b(proposal|dissertation|thesis|methodology|literature review|data analysis|statistical analysis|qualitative analysis|mixed methods|questionnaire|data collection tool|chapter\s*[1-6]|results|discussion|editing|proofread|referencing|topic|objectives?)\b/i;
const COURSE = /\b(ai[- ]?(?:assisted|enhanced).*proposal|proposal writing course|research proposal writing course|course|training|self[- ]?paced|learn (?:the )?(?:proposal|research) process|do it myself|write it myself|work on it myself|complete it myself)\b/i;
const SELF_DIRECTED_ROUTE = /\b(?:do|write|work on|complete|finish)\s+(?:it|the proposal|my proposal|the research|my research|the work|my work)?\s*myself\b|\bi want to (?:do|write|work on|complete|finish)\b.{0,35}\bmyself\b/ig;
const HANDS_ON_ROUTE = /\b(?:do it for me|hands[- ]?on|direct support|help with my|assist me with my|help me with my|handle (?:it|this|the work)|complete (?:it|this|the work) for me)\b/ig;
const PA_GYM = /\b(pa\s*gym|osce|theory practice|question practice|exam prep|exam preparation)\b/i;
const PA_GYM_FORMAT = /\b(theory|osce|both|question practice|questions)\b/i;
const DIGITAL = /\b(website|web development|software|system|app|application|automation|business automation|cybersecurity|portal|dashboard)\b/i;
const DIGITAL_SCOPE = /\b(booking|payments?|inventory|attendance|exam|learning management|lms|dashboard|whatsapp|sms|client portal|student portal|employee|workforce|logbook|ecommerce|e-commerce|orders?|reports?|analytics|registration|database|crm|notifications?)\b/i;
const PROGRAMME = /\b(masters?|master['’]?s|mph|msc|ma\b|phd|doctorate|doctoral|postgraduate|post-graduate|undergraduate|bachelor['’]?s|degree|diploma|mbchb|medicine|medical|nursing|pharmacy|public health|business|education|law|engineering)\b/i;
const DEADLINE = /\b(deadline|due\s+(?:on|by)|needed?\s+by|complete(?:d)?\s+by|submit(?:ted)?\s+by|tomorrow|today|tonight|next\s+week|next\s+month|this\s+week|this\s+month|within\s+\d+\s*(?:hours?|days?|weeks?)|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))\b/i;

function conversationText(history: Pick<ConversationMessage, "role" | "content">[], latestText: string) {
  const client = history.filter((message) => message.role === "user").map((message) => message.content);
  if (!client.length || client.at(-1)?.trim() !== latestText.trim()) client.push(latestText);
  return client.join("\n");
}

function lastMatchIndex(text: string, pattern: RegExp) {
  let last = -1;
  for (const match of text.matchAll(pattern)) last = match.index ?? last;
  pattern.lastIndex = 0;
  return last;
}

function latestResearchRoute(transcript: string): "course" | "research" | null {
  const selfDirectedIndex = lastMatchIndex(transcript, SELF_DIRECTED_ROUTE);
  const handsOnIndex = lastMatchIndex(transcript, HANDS_ON_ROUTE);
  if (selfDirectedIndex < 0 && handsOnIndex < 0) return null;
  return selfDirectedIndex > handsOnIndex ? "course" : "research";
}

function kindFor(lead: Pick<Lead, "serviceInterest" | "packageName">, transcript: string): QualificationKind {
  const context = `${lead.serviceInterest || ""} ${lead.packageName || ""} ${transcript}`;
  if (PA_GYM.test(context)) return "pa_gym";
  if (DIGITAL.test(context)) return "digital";

  if (RESEARCH.test(context) || COURSE.test(context)) {
    const latestRoute = latestResearchRoute(transcript);
    if (latestRoute === "course") return "course";
    if (latestRoute === "research") return "research";
  }

  if (COURSE.test(context)) return "course";
  if (RESEARCH.test(context)) return "research";
  return "other";
}

function hasProgramme(lead: Pick<Lead, "programme">, transcript: string) {
  return Boolean(lead.programme?.trim() || PROGRAMME.test(transcript));
}

function hasDeadline(lead: Pick<Lead, "deadline">, transcript: string) {
  return Boolean(lead.deadline?.trim() || DEADLINE.test(transcript));
}

function hasExactNeed(lead: Pick<Lead, "serviceInterest" | "packageName">, transcript: string) {
  const stored = `${lead.serviceInterest || ""} ${lead.packageName || ""}`.trim();
  if (stored && !/research enquiry|service not established|research support$/i.test(stored)) return true;
  return RESEARCH_SCOPE.test(transcript) || PA_GYM.test(transcript) || DIGITAL.test(transcript) || COURSE.test(transcript);
}

export function assessLeadQualification(input: {
  lead: Pick<Lead, "status" | "serviceInterest" | "packageName" | "programme" | "deadline">;
  history: Pick<ConversationMessage, "role" | "content">[];
  latestText: string;
}): LeadQualification {
  const transcript = conversationText(input.history, input.latestText);
  const kind = kindFor(input.lead, transcript);
  const assistantHistory = input.history.filter((message) => message.role === "assistant").map((message) => message.content).join("\n");
  const priorPriceContext = PRICE_VALUE.test(assistantHistory) || PRICE_OBJECTION.test(input.latestText) || input.lead.status === "PAYMENT PENDING" || input.lead.status === "CONVERTED";
  const commercialIntent = COMMERCIAL_INTENT.test(input.latestText) && !EXISTING_DOCUMENT_REQUEST.test(input.latestText);

  let missing: QualificationMissing = null;

  if (kind === "research") {
    const routeChosen = /hands[- ]?on|direct support|help with my|assist me|do it for me|research support/i.test(transcript) || RESEARCH_SCOPE.test(transcript);
    if (!routeChosen && COURSE.test(transcript)) missing = "path";
    else if (!hasExactNeed(input.lead, transcript)) missing = "need";
    else if (!hasProgramme(input.lead, transcript)) missing = "programme";
    else if (!hasDeadline(input.lead, transcript)) missing = "deadline";
  } else if (kind === "course") {
    if (!COURSE.test(transcript) && latestResearchRoute(transcript) !== "course") missing = "path";
  } else if (kind === "pa_gym") {
    if (!hasProgramme(input.lead, transcript)) missing = "programme";
    else if (!PA_GYM_FORMAT.test(transcript)) missing = "format";
  } else if (kind === "digital") {
    if (!DIGITAL_SCOPE.test(transcript)) missing = "scope";
    else if (!hasDeadline(input.lead, transcript)) missing = "deadline";
  } else {
    if (!hasExactNeed(input.lead, transcript)) missing = "need";
    else if (!hasDeadline(input.lead, transcript)) missing = "deadline";
  }

  return {
    commercialIntent,
    qualified: missing === null,
    priorPriceContext,
    kind,
    missing
  };
}
