const legacyPrepPatterns = [
  /\bpa\s*gym\b/gi,
  /\bpagym\b/gi
];

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

  if (!title) blockers.push("Add a working title.");
  if (!body) blockers.push("Add a caption.");
  if (hasLegacyPrepBrand(combined)) blockers.push("Replace the retired product name with MedMinds Prep.");
  if (riskyClaimPatterns.some((pattern) => pattern.test(body))) warnings.push("Review the caption for an unsupported guarantee or academic-outcome claim.");
  if (body.length > 1800) warnings.push("This caption is long for most social feeds. Consider shortening it.");
  if (body && body.length < 80) warnings.push("The caption may be too brief to explain the practical value clearly.");
  if ((body.match(/!/g) || []).length > 2) warnings.push("Reduce exclamation marks to keep the MedMinds voice credible.");
  if ((body.match(/#[A-Za-z0-9_]+/g) || []).length > 3) warnings.push("Use no more than three relevant hashtags.");

  const checks = [
    { label: "Current MedMinds Prep naming", ok: !hasLegacyPrepBrand(combined) },
    { label: "Working title added", ok: Boolean(title) },
    { label: "Caption added", ok: Boolean(body) },
    { label: "No obvious guaranteed-outcome claim", ok: !riskyClaimPatterns.some((pattern) => pattern.test(body)) },
    { label: "Social-friendly length", ok: body.length >= 80 && body.length <= 1800 }
  ];

  const score = Math.max(0, Math.round((checks.filter((check) => check.ok).length / checks.length) * 100));
  return { score, blockers, warnings, checks };
}
