import { formatPremiumCaption } from "@/lib/content-caption-style";
import {
  ensureDestinationInCaption,
  removeLegacyMedMindsUrls,
  selectContentDestination,
  type ContentDestination
} from "@/lib/content-destinations";
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

function safe(output: GeneratedContentOutput): GeneratedContentOutput {
  return {
    ...output,
    body: normalizeMedMindsBranding(output.body),
    alternatives: output.alternatives.map(normalizeMedMindsBranding),
    headline: normalizeMedMindsBranding(output.headline),
    imageBrief: normalizeMedMindsBranding(output.imageBrief)
  };
}

export function finalizeGeneratedContent(output: GeneratedContentOutput, input: ContentGenerationInput) {
  const normalized = safe(output);
  const format = (caption: string) => {
    const cleaned = removeLegacyMedMindsUrls(caption);
    const destination = destinationForGeneratedContent(input, cleaned);
    const linked = input.cta === "none" ? cleaned : ensureDestinationInCaption(cleaned, destination);
    return formatPremiumCaption(linked, { contentType: input.contentType, objective: input.objective, audience: input.audience });
  };
  const alternatives = (normalized.alternatives.length ? normalized.alternatives : [normalized.body]).map(format);
  return { ...normalized, body: alternatives[0] || format(normalized.body), alternatives };
}
