import { findAiStyleSignals } from "@/lib/content-human-style";

const legacyPrepPatterns = [
  /\bpa\s*gym\b/gi,
  /\bpagym\b/gi
];

const legacyDestinationPatterns = [
  /https?:\/\/(?:www\.)?medmindslc\.site\//i,
  /https?:\/\/(?:www\.)?medmindslc\.online\/(?:nmcz|preclinical|pa-gym(?:-[\w-]+)?|mayadi)(?:[/?#]|\b)/i
];

const prepContextPattern = /medminds prep|nmcz|preclinical|qbank|question bank|past papers theory|osce clinical skills|\bstp\b|\bmmed\b|pg internal medicine/i;
const staleTrialPattern = /\b(?:24[ -]?hour|1[ -]?day)\s+(?:free\s+)?(?:trial|pass)\b/i;

const riskyClaimPatterns = [
  /\bguaranteed?\s+(pass|success|approval|publication|results?)\b/i,
  /\b100%\s+(pass|success|approval)\b/i,
  /\bguaranteed?\s+results?\b/i,
  /\bundetectable\s+ai\b/i,
  /\bguaranteed?\s+(grade|marks?)\b/i
];

const genericHookPatterns = [
  /^at medminds\b/i,
  /^whether you\b/i,
  /^good (?:exam|revision|study)\b/i,
  /^exam revision is\b/i,
  /^medminds (?:helps|offers|provides|is)\b/i
];

const proofLanguagePattern = /\b(?:hundreds|thousands)\b|\b\d+(?:\.\d+)?%\b.{0,40}\b(?:students|users|pass|success|improv)|\b(?:students|users)\s+(?:love|recommend|say)\b/i;

export function normalizeMedMindsBranding(value: string) {
  let output = String(value || "");
  for (const pattern of legacyPrepPatterns) output = output.replace(pattern, "MedMinds Prep");
  return output;
}

export function hasLegacyPrepBrand(value: string) {
  const text = String(value || "");
  return legacyPrepPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function hasLegacyContentDestination(value: string) {
  const text = String(value || "");
  return legacyDestinationPatterns.some((pattern) => pattern.test(text));
}

export type ContentQualityResult = {
  score: number;
  blockers: string[];
  warnings: string[];
  checks: Array<{ label: string; ok: boolean }>;
};

function comparisonKey(value: string) {
  return value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstCaptionLine(body: string) {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !/^https?:\/\//i.test(line) && !line.startsWith("#")) || "";
}

export function assessMedMindsContent(input: { title?: string; body?: string; contentType?: string; cta?: string }): ContentQualityResult {
  const title = String(input.title || "").trim();
  const body = String(input.body || "").trim();
  const combined = `${title} ${input.contentType || ""} ${body}`;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const hasLegacyDestination = hasLegacyContentDestination(combined);
  const hasStalePrepTrial = prepContextPattern.test(combined) && staleTrialPattern.test(combined);
  const aiStyleSignals = findAiStyleSignals(`${title}\n${body}`);
  const hasDashSignal = aiStyleSignals.includes("em/en dash punctuation");
  const aiPhraseSignals = aiStyleSignals.filter((signal) => signal !== "em/en dash punctuation");
  const hook = firstCaptionLine(body);
  const genericHook = genericHookPatterns.some((pattern) => pattern.test(comparisonKey(hook)));
  const repeatedTitleHook = comparisonKey(title).length >= 6 && comparisonKey(title) === comparisonKey(hook);
  const weakCta = input.cta !== "none" && /\bexplore(?: the)?\b/i.test(body);
  const hashtags = body.match(/#[A-Za-z0-9_]+/g) || [];
  const firstParagraph = body.split(/\n\s*\n/).find((paragraph) => paragraph.trim())?.trim() || "";

  if (!title) blockers.push("Add a working title.");
  if (!body) blockers.push("Add a caption.");
  if (hasLegacyPrepBrand(combined)) blockers.push("Replace the retired product name with MedMinds Prep.");
  if (hasLegacyDestination) blockers.push("Replace the outdated MedMinds link with the current topic-specific destination before approval.");
  if (hasStalePrepTrial) blockers.push("MedMinds Prep currently uses a 2-day free trial. Replace the old 24-hour/1-day trial wording.");
  if (hasDashSignal) blockers.push("Remove em dashes and en dashes. Use normal punctuation or a simple hyphen instead.");
  if (aiPhraseSignals.length) blockers.push(`Rewrite AI-like marketing wording before approval: ${aiPhraseSignals.slice(0, 2).join(", ")}.`);
  if (riskyClaimPatterns.some((pattern) => pattern.test(body))) warnings.push("Review the caption for an unsupported guarantee or academic-outcome claim.");
  if (proofLanguagePattern.test(body)) warnings.push("Verify any student count, percentage, recommendation or results claim against an approved source before publishing.");
  if (body.length > 900) warnings.push("This caption is dense for a mobile social feed. Shorten it or split the message into a tighter post.");
  if (body && body.length < 80) warnings.push("The caption may be too brief to explain the practical value clearly.");
  if (firstParagraph.length > 280) warnings.push("The opening paragraph is dense. Keep early paragraphs short enough to scan on a phone.");
  if (genericHook) warnings.push("Strengthen the opening. Start with a specific audience problem, question, tension or desired outcome rather than a generic statement.");
  if (repeatedTitleHook) warnings.push("The caption opening repeats the working/creative title. Let the graphic stop the scroll and use the caption to add new information.");
  if (weakCta) warnings.push("Use a more direct call to action than 'explore'. Tell the reader exactly what to do next.");
  if ((body.match(/!/g) || []).length > 2) warnings.push("Reduce exclamation marks to keep the MedMinds voice credible.");
  if (hashtags.length > 3) warnings.push("Use no more than three relevant hashtags.");

  const checks = [
    { label: "Current MedMinds Prep naming", ok: !hasLegacyPrepBrand(combined) },
    { label: "Current MedMinds destination link", ok: !hasLegacyDestination },
    { label: "Current 2-day Prep trial wording", ok: !hasStalePrepTrial },
    { label: "No em/en dash punctuation", ok: !hasDashSignal },
    { label: "Natural, non-formulaic wording", ok: aiPhraseSignals.length === 0 },
    { label: "Working title added", ok: Boolean(title) },
    { label: "Caption added", ok: Boolean(body) },
    { label: "Specific, audience-relevant opening", ok: Boolean(body) && !genericHook },
    { label: "Graphic title and caption opening complement each other", ok: !repeatedTitleHook },
    { label: "Direct CTA wording", ok: !weakCta },
    { label: "No obvious guaranteed-outcome claim", ok: !riskyClaimPatterns.some((pattern) => pattern.test(body)) },
    { label: "Mobile-friendly length", ok: body.length >= 80 && body.length <= 900 },
    { label: "Hashtag restraint", ok: hashtags.length <= 3 }
  ];

  const score = Math.max(0, Math.round((checks.filter((check) => check.ok).length / checks.length) * 100));
  return { score, blockers, warnings, checks };
}
