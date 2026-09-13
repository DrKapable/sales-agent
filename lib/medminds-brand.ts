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

  if (!title) blockers.push("Add a working title.");
  if (!body) blockers.push("Add a caption.");
  if (hasLegacyPrepBrand(combined)) blockers.push("Replace the retired product name with MedMinds Prep.");
  if (hasLegacyDestination) blockers.push("Replace the outdated MedMinds link with the current topic-specific destination before approval.");
  if (hasStalePrepTrial) blockers.push("MedMinds Prep currently uses a 2-day free trial. Replace the old 24-hour/1-day trial wording.");
  if (hasDashSignal) blockers.push("Remove em dashes and en dashes. Use normal punctuation or a simple hyphen instead.");
  if (aiPhraseSignals.length) blockers.push(`Rewrite AI-like marketing wording before approval: ${aiPhraseSignals.slice(0, 2).join(", ")}.`);
  if (riskyClaimPatterns.some((pattern) => pattern.test(body))) warnings.push("Review the caption for an unsupported guarantee or academic-outcome claim.");
  if (body.length > 1800) warnings.push("This caption is long for most social feeds. Consider shortening it.");
  if (body && body.length < 80) warnings.push("The caption may be too brief to explain the practical value clearly.");
  if ((body.match(/!/g) || []).length > 2) warnings.push("Reduce exclamation marks to keep the MedMinds voice credible.");
  if ((body.match(/#[A-Za-z0-9_]+/g) || []).length > 3) warnings.push("Use no more than three relevant hashtags.");

  const checks = [
    { label: "Current MedMinds Prep naming", ok: !hasLegacyPrepBrand(combined) },
    { label: "Current MedMinds destination link", ok: !hasLegacyDestination },
    { label: "Current 2-day Prep trial wording", ok: !hasStalePrepTrial },
    { label: "No em/en dash punctuation", ok: !hasDashSignal },
    { label: "Natural, non-formulaic wording", ok: aiPhraseSignals.length === 0 },
    { label: "Working title added", ok: Boolean(title) },
    { label: "Caption added", ok: Boolean(body) },
    { label: "No obvious guaranteed-outcome claim", ok: !riskyClaimPatterns.some((pattern) => pattern.test(body)) },
    { label: "Social-friendly length", ok: body.length >= 80 && body.length <= 1800 }
  ];

  const score = Math.max(0, Math.round((checks.filter((check) => check.ok).length / checks.length) * 100));
  return { score, blockers, warnings, checks };
}
