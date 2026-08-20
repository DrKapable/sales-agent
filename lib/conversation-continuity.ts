import { getConversation, getOrCreateLead, updateLead } from "@/lib/store";
import type { ConversationMessage, Lead, LeadPatch } from "@/lib/types";

type QuestionKind = "deadline" | "programme" | "format" | "scope" | "generic";
type ConversationSnippet = Pick<ConversationMessage, "role" | "content">;

const CLARIFICATION_REQUEST = /\b(what do you mean|what does that mean|i don['’]?t understand|i do not understand|can you explain|please explain|explain that|what exactly|which one)\b/i;
const NO_ANSWER = /\b(i don['’]?t know|i do not know|not sure|unsure|no idea|haven['’]?t decided|have not decided|not decided|not certain)\b/i;
const PAUSE_REQUEST = /^\s*(?:wait|hold on|hold up|one moment|give me (?:a )?moment|just a (?:moment|second)|let me (?:check|think)|pause|okay wait|ok wait)\b/i;
const TIME_ANSWER = /\b(?:asap|urgent|today|tomorrow|tonight|this\s+(?:week|month|year)|next\s+(?:week|month|year)|within\s+\d+\s*(?:hours?|days?|weeks?|months?)|(?:end|middle|start|beginning)\s+of\s+(?:(?:this|next)\s+)?(?:week|month|year)|(?:by|before|around)\s+(?:(?:the\s+)?(?:end|middle|start|beginning)\s+of\s+)?(?:(?:this|next)\s+)?(?:week|month|year|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{1,2}(?:,?\s+(?:19|20)\d{2})?|\s+(?:19|20)\d{2})?|(?:19|20)\d{2})|(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{1,2}(?:,?\s+(?:19|20)\d{2})?|\s+(?:19|20)\d{2})?|(?:19|20)\d{2}|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?)\b/i;
const PROGRAMME_LEVEL = /\b(?:masters?|master['’]?s|msc|mph|ma\b|mmed|postgraduate|post-graduate|phd|doctorate|doctoral|undergraduate|bachelor['’]?s|degree|diploma|mbchb|medicine|medical|nursing|pharmacy|public health|business|education|law|engineering|mba)\b/i;
const FORMAT_ANSWER = /\b(theory|osce|both)\b/i;
const NON_PROGRAMME_SENTENCE = /\b(?:how|what|when|where|why|can|could|would|should|need|want|help|price|pricing|cost|charge|charges|fee|fees|quotation|quote|proposal|dissertation|thesis|research|everything|work|do|write|handle|pay|payment)\b/i;

function extractLastQuestion(text: string) {
  const end = text.lastIndexOf("?");
  if (end < 0) return null;
  const prefix = text.slice(0, end + 1);
  const boundaries = [
    { index: prefix.lastIndexOf("?", end - 1), length: 1 },
    { index: prefix.lastIndexOf(". "), length: 2 },
    { index: prefix.lastIndexOf("! "), length: 2 },
    { index: prefix.lastIndexOf("\n"), length: 1 }
  ];
  const boundary = boundaries.reduce((best, item) => item.index > best.index ? item : best, { index: -1, length: 0 });
  return prefix.slice(boundary.index >= 0 ? boundary.index + boundary.length : 0).trim();
}

function normalizeQuestion(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(?:please|kindly|can you|could you|would you|tell me)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionKind(question: string | null): QuestionKind {
  const text = String(question || "").toLowerCase();
  if (/\b(deadline|due|submit|submission|completed?|finished?)\b/.test(text) || /\bwhen\b.{0,45}\b(?:need|want|require|working toward)\b/.test(text)) return "deadline";
  if (/\b(programme|program|academic level|level of study|course of study|examination|exam)\b/.test(text)) return "programme";
  if (/\b(theory|osce)\b/.test(text) && /\b(?:both|need|want|prefer|which)\b/.test(text)) return "format";
  if (/\bwhat\b.{0,45}\b(?:need|help|handle|part|work|system|website|automation|do for you)\b/.test(text)) return "scope";
  return "generic";
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(normalizeQuestion(left).split(" ").filter((token) => token.length > 2));
  const b = new Set(normalizeQuestion(right).split(" ").filter((token) => token.length > 2));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

function questionsEquivalent(left: string, right: string) {
  const a = normalizeQuestion(left);
  const b = normalizeQuestion(right);
  if (a === b) return true;
  const leftKind = questionKind(left);
  const rightKind = questionKind(right);
  if (leftKind !== "generic" && leftKind === rightKind) return true;
  return tokenSimilarity(left, right) >= 0.78;
}

function lowInformation(text: string) {
  const meaningful = text.match(/[\p{L}\p{N}]/gu)?.join("") ?? "";
  return meaningful.length < 2;
}

function normalizeProgrammeAnswer(text: string) {
  if (/\b(phd|doctorate|doctoral)\b/i.test(text)) return "PhD/Doctoral";
  if (/\b(masters?|master['’]?s|msc|mph|ma\b|mmed|postgraduate|post-graduate)\b/i.test(text)) return "Master's/Postgraduate";
  if (/\b(undergraduate|bachelor['’]?s|degree|mbchb)\b/i.test(text)) return "Undergraduate/Bachelor's";
  if (/\bdiploma\b/i.test(text)) return "Diploma";
  return text.trim().replace(/\s+/g, " ").slice(0, 180);
}

function looksLikeProgrammeAnswer(text: string) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean || clean.includes("?") || clean.length > 100) return false;
  if (PROGRAMME_LEVEL.test(clean)) return true;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 8 || NON_PROGRAMME_SENTENCE.test(clean)) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N}\s&.,'’()/-]{1,90}$/u.test(clean);
}

function previousAssistantQuestion(history: ConversationSnippet[]) {
  for (const message of [...history].reverse()) {
    if (message.role !== "assistant") continue;
    const question = extractLastQuestion(message.content);
    if (question) return question;
  }
  return null;
}

function answerFitsQuestion(kind: QuestionKind, text: string) {
  const clean = text.trim();
  if (!clean || CLARIFICATION_REQUEST.test(clean) || NO_ANSWER.test(clean) || PAUSE_REQUEST.test(clean) || lowInformation(clean)) return false;
  if (kind === "deadline") return TIME_ANSWER.test(clean);
  if (kind === "programme") return looksLikeProgrammeAnswer(clean);
  if (kind === "format") return FORMAT_ANSWER.test(clean);
  if (kind === "scope") return !PROGRAMME_LEVEL.test(clean) && !TIME_ANSWER.test(clean) && clean.length >= 3;
  return false;
}

export function inferConversationAnswerPatch(
  history: ConversationSnippet[],
  clientText: string,
  lead: Pick<Lead, "programme" | "deadline" | "packageName">
): LeadPatch {
  const clean = clientText.trim();
  if (!clean || CLARIFICATION_REQUEST.test(clean) || NO_ANSWER.test(clean) || PAUSE_REQUEST.test(clean) || lowInformation(clean)) return {};

  const previousQuestion = previousAssistantQuestion(history);
  const kind = questionKind(previousQuestion);
  const patch: LeadPatch = {};

  if (kind === "deadline" && !lead.deadline && clean.length <= 120 && TIME_ANSWER.test(clean)) {
    patch.deadline = clean.replace(/\s+/g, " ").slice(0, 120);
  }

  if (kind === "programme" && !lead.programme && clean.length <= 180 && looksLikeProgrammeAnswer(clean)) {
    patch.programme = normalizeProgrammeAnswer(clean);
  }

  if (kind === "format" && !lead.packageName) {
    const match = clean.match(FORMAT_ANSWER)?.[0]?.toLowerCase();
    if (match === "both") patch.packageName = "Theory + OSCE";
    else if (match === "theory") patch.packageName = "Theory";
    else if (match === "osce") patch.packageName = "OSCE";
  }

  return patch;
}

export async function captureConversationAnswer(phone: string, clientText: string, source: "whatsapp" | "simulator") {
  const [lead, history] = await Promise.all([
    getOrCreateLead(phone, source),
    getConversation(phone, 48).catch(() => [])
  ]);
  const patch = inferConversationAnswerPatch(history, clientText, lead);
  if (!Object.keys(patch).length) return lead;
  return updateLead(phone, patch).catch(() => lead);
}

function clarificationReply(kind: QuestionKind) {
  if (kind === "deadline") return "By deadline, I mean when you need the work completed or submitted. An exact date is not necessary; even a month and year such as January 2027 is enough.";
  if (kind === "programme") return "By programme or academic level, I mean what you are studying and the level, for example diploma, bachelor’s, master’s, PhD, MBChB or MPH. You can answer in your own words.";
  if (kind === "format") return "I mean which Pa Gym option you want: theory practice, OSCE preparation, or both.";
  if (kind === "scope") return "I mean the specific work or outcome you want MedMinds to help with. Just describe the part you want handled in your own words.";
  return "I meant the last detail I asked for so I can understand your request correctly. You can answer it in your own words; it does not need to follow a special format.";
}

function unsureReply(kind: QuestionKind) {
  if (kind === "deadline") return "That’s okay. If you do not have an exact deadline yet, even an approximate month or timeframe is enough for now.";
  if (kind === "programme") return "That’s okay. Just tell me the closest description of your programme or level, and I’ll work from that.";
  if (kind === "format") return "That’s okay. If you are unsure, tell me whether you mainly need written/theory practice, clinical OSCE practice, or a mix of both.";
  if (kind === "scope") return "That’s okay. Tell me the main outcome you want, and I’ll help narrow down the right service from there.";
  return "That’s okay. Give me the closest answer you can, and I’ll work from that rather than make you repeat yourself.";
}

function notedReply(kind: QuestionKind) {
  if (kind === "deadline") return "I’ve noted the timeframe you gave me, so I won’t ask you for the deadline again.";
  if (kind === "programme") return "I’ve noted your programme or level, so I’ll continue from there.";
  if (kind === "format") return "I’ve noted the option you chose, so I’ll continue from there.";
  if (kind === "scope") return "I’ve noted what you need, so I’ll continue from there.";
  return "I’ve noted your answer, so I’ll continue from there rather than ask you the same thing again.";
}

function mismatchReply(kind: QuestionKind, clientText: string) {
  const clean = clientText.trim().replace(/\s+/g, " ");
  if (kind === "deadline" && looksLikeProgrammeAnswer(clean)) {
    return `Got it — I’ve noted your programme/level as ${normalizeProgrammeAnswer(clean)}. I still need the timing: when do you need the work completed or submitted?`;
  }
  if (kind === "programme" && TIME_ANSWER.test(clean)) {
    return "Thanks — I’ve noted the timeframe. I still need your programme or academic level so I can match the correct service and fee.";
  }
  if (kind === "deadline") return "Thanks. I still need one timing detail: when do you need the work completed or submitted?";
  if (kind === "programme") return "Thanks. I still need your programme or academic level, for example bachelor’s, master’s, PhD, MBChB or MPH.";
  if (kind === "format") return "Thanks. I still need to know whether you want theory practice, OSCE preparation, or both.";
  if (kind === "scope") return "Thanks. I still need the specific work or outcome you want MedMinds to handle.";
  return "Thanks. I may have asked that unclearly — please answer the last detail in your own words and I’ll continue from there.";
}

export function repairConversationReply(candidateReply: string, clientText: string, recentAssistantReplies: string[] = []) {
  const candidate = candidateReply.trim();
  if (PAUSE_REQUEST.test(clientText.trim())) return "Of course — take your time. I’ll be here when you’re ready.";

  const candidateQuestion = extractLastQuestion(candidate);
  if (!candidateQuestion || !recentAssistantReplies.length) return candidate;

  const previousQuestion = [...recentAssistantReplies]
    .reverse()
    .map(extractLastQuestion)
    .find((question): question is string => Boolean(question && questionsEquivalent(question, candidateQuestion)));
  if (!previousQuestion) return candidate;

  const kind = questionKind(previousQuestion);
  const cleanClient = clientText.trim();
  if (CLARIFICATION_REQUEST.test(cleanClient) || lowInformation(cleanClient)) return clarificationReply(kind);
  if (NO_ANSWER.test(cleanClient)) return unsureReply(kind);

  const withoutRepeatedQuestion = candidate.replace(candidateQuestion, "").replace(/\s+/g, " ").trim().replace(/[,:;-]+$/, "").trim();
  if (answerFitsQuestion(kind, cleanClient)) {
    if (withoutRepeatedQuestion.length >= 18) return withoutRepeatedQuestion;
    return notedReply(kind);
  }

  const bridge = mismatchReply(kind, cleanClient);
  return withoutRepeatedQuestion.length >= 18 ? `${withoutRepeatedQuestion} ${bridge}` : bridge;
}
