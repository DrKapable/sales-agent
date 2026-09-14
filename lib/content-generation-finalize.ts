import { formatPremiumCaption } from "@/lib/content-caption-style";
import {
  ensureDestinationInCaption,
  removeLegacyMedMindsUrls,
  selectContentDestination,
  type ContentDestination
} from "@/lib/content-destinations";
import { humanizeGeneratedText } from "@/lib/content-human-style";
import { normalizeMedMindsBranding } from "@/lib/medminds-brand";

export type GeneratedContentOutput = { body: string; alternatives: string[]; headline: string; imageBrief: string };
export type ContentGenerationInput = {
  contentType: string;
  objective: string;
  audience: string;
  notes: string;
  existingBody: string;
  cta: string;
};

export function destinationForGeneratedContent(input: ContentGenerationInput, body: string): ContentDestination | null {
  return selectContentDestination({
    contentType: input.contentType,
    objective: input.objective,
    audience: input.audience,
    notes: input.notes,
    body: `${input.existingBody || ""} ${body}`
  });
}

function natural(value: string) {
  return humanizeGeneratedText(normalizeMedMindsBranding(value));
}

function safe(output: GeneratedContentOutput): GeneratedContentOutput {
  return {
    ...output,
    body: natural(output.body),
    alternatives: output.alternatives.map(natural),
    headline: natural(output.headline),
    imageBrief: natural(output.imageBrief)
  };
}

function comparable(value: string) {
  return value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeExactHeadlineEcho(caption: string, headline: string) {
  const headlineKey = comparable(headline);
  if (headlineKey.length < 6) return caption;
  const lines = caption.replace(/\r\n?/g, "\n").split("\n");
  const firstIndex = lines.findIndex((line) => line.trim() && !/^https?:\/\//i.test(line.trim()) && !line.trim().startsWith("#"));
  if (firstIndex < 0 || comparable(lines[firstIndex]) !== headlineKey) return caption;
  lines.splice(firstIndex, 1);
  return lines.join("\n").replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function finalizeGeneratedContent(output: GeneratedContentOutput, input: ContentGenerationInput) {
  const normalized = safe(output);
  const format = (caption: string) => {
    const human = removeExactHeadlineEcho(natural(caption), normalized.headline);
    const cleaned = removeLegacyMedMindsUrls(human);
    const destination = destinationForGeneratedContent(input, cleaned);
    const linked = input.cta === "none" ? cleaned : ensureDestinationInCaption(cleaned, destination);
    return formatPremiumCaption(humanizeGeneratedText(linked), {
      contentType: input.contentType,
      objective: input.objective,
      audience: input.audience
    });
  };
  const alternatives = (normalized.alternatives.length ? normalized.alternatives : [normalized.body]).map(format);
  return { ...normalized, body: alternatives[0] || format(normalized.body), alternatives };
}
