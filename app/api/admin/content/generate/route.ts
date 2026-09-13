import { gateway, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiModelCandidates } from "@/lib/env";
import { buildPremiumContentInstructions } from "@/lib/content-generation-prompt";
import {
  destinationForGeneratedContent,
  finalizeGeneratedContent,
  type GeneratedContentOutput
} from "@/lib/content-generation-finalize";
import { normalizeMedMindsBranding } from "@/lib/medminds-brand";
import { selectContentDestination } from "@/lib/content-destinations";
import { listOffers } from "@/lib/store";

const schema = z.object({
  contentType: z.string().trim().min(2).max(100),
  objective: z.string().trim().min(2).max(600),
  audience: z.string().trim().max(350).optional().default("Medical students, nurses, postgraduate students, health professionals and researchers in Zambia and beyond"),
  tone: z.enum(["professional", "friendly", "educational", "conversational", "authoritative", "community", "urgent"]).default("professional"),
  angle: z.enum(["auto", "direct", "story", "problem-solution", "myth-fact", "checklist", "faq", "educational", "community"]).default("auto"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  cta: z.enum(["message", "learn", "enrol", "try", "book", "comment", "none"]).default("message"),
  notes: z.string().trim().max(1800).optional().default(""),
  brandVoice: z.string().trim().max(1000).optional().default("Premium, credible, practical and academically grounded. Sound like an experienced MedMinds educator: warm, confident and concise, with polished mobile-first formatting and purposeful emoji cues where they improve scanning."),
  existingBody: z.string().trim().max(10000).optional().default(""),
  action: z.enum(["generate", "humanise", "strengthen-hook", "shorten"]).default("generate"),
  variationCount: z.number().int().min(1).max(3).default(3)
});

type ContentInput = z.infer<typeof schema>;

function parseOutput(text: string, wanted: number): GeneratedContentOutput {
  const cleaned = text.trim();
  const headline = cleaned.match(/\[\[HEADLINE\]\]\s*([\s\S]*?)(?=\[\[|$)/)?.[1]?.trim() || "";
  const imageBrief = cleaned.match(/\[\[IMAGE_BRIEF\]\]\s*([\s\S]*?)(?=\[\[|$)/)?.[1]?.trim() || "";
  const captions: string[] = [];
  const regex = /\[\[CAPTION_(\d+)\]\]\s*([\s\S]*?)(?=\[\[|$)/g;
  for (const match of cleaned.matchAll(regex)) {
    const value = match[2]?.trim();
    if (value) captions.push(value);
  }
  if (!captions.length && cleaned) captions.push(cleaned.replace(/\[\[[A-Z0-9_]+\]\]/g, "").trim());
  return { body: captions[0] || "", alternatives: captions.slice(0, wanted), headline, imageBrief };
}

function actionGuide(input: ContentInput) {
  if (input.action === "humanise") return `Rewrite this caption so it sounds premium, natural, specific and human while preserving factual claims:\n${normalizeMedMindsBranding(input.existingBody)}`;
  if (input.action === "strengthen-hook") return `Give this caption a stronger, premium opening without clickbait, then improve the mobile readability:\n${normalizeMedMindsBranding(input.existingBody)}`;
  if (input.action === "shorten") return `Shorten this caption into a clean, highly scannable Facebook version without losing important information:\n${normalizeMedMindsBranding(input.existingBody)}`;
  return "Create new premium Facebook content from the brief.";
}

function generationContext(input: ContentInput) {
  return {
    contentType: input.contentType,
    objective: input.objective,
    audience: input.audience,
    notes: input.notes,
    existingBody: input.existingBody,
    cta: input.cta
  };
}

function fallback(input: ContentInput) {
  const base = `${normalizeMedMindsBranding(input.objective)}\n\n✅ Clear, focused support designed for ${normalizeMedMindsBranding(input.audience)}.\n\n📚 MedMinds keeps the next step practical and easy to follow.`;
  return finalizeGeneratedContent({
    body: base,
    alternatives: [base],
    headline: normalizeMedMindsBranding(input.objective).slice(0, 76),
    imageBrief: "Premium MedMinds Facebook creative with strong hierarchy, generous whitespace and a content-appropriate layout in navy, teal, green, cream and white."
  }, generationContext(input));
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid content generation request." }, { status: 400 });

  const input = parsed.data;
  const offers = (await listOffers()).filter((offer) => offer.active).map((offer) => ({
    name: normalizeMedMindsBranding(offer.name),
    category: normalizeMedMindsBranding(offer.category),
    description: normalizeMedMindsBranding(offer.description),
    features: offer.features.map(normalizeMedMindsBranding),
    priceZmw: offer.priceZmw,
    rushPriceZmw: offer.rushPriceZmw
  }));
  const selectedDestination = selectContentDestination({
    contentType: input.contentType,
    objective: input.objective,
    audience: input.audience,
    notes: input.notes,
    body: input.existingBody
  });
  const instructions = buildPremiumContentInstructions(input, selectedDestination, offers);
  const prompt = `Task: ${actionGuide(input)}\nContent type: ${normalizeMedMindsBranding(input.contentType)}\nObjective: ${normalizeMedMindsBranding(input.objective)}\nAudience: ${normalizeMedMindsBranding(input.audience)}\nTone: ${input.tone}\nAngle: ${input.angle}\nLength: ${input.length}\nCTA: ${input.cta}\nAdditional instructions: ${normalizeMedMindsBranding(input.notes || "None")}`;

  let lastError: unknown = null;
  for (const model of getAiModelCandidates()) {
    try {
      const agent = new ToolLoopAgent({ model: gateway(model), instructions, tools: {} });
      const result = await agent.generate({ prompt });
      const output = finalizeGeneratedContent(parseOutput(result.text, input.variationCount), generationContext(input));
      if (output.body) {
        return NextResponse.json({
          ...output,
          destination: destinationForGeneratedContent(generationContext(input), output.body),
          model,
          mode: "agent",
          style: "premium-facebook"
        });
      }
    } catch (error) {
      lastError = error;
      console.warn("MedMinds content generation attempt failed", { model, error });
    }
  }

  console.error("MedMinds content generation failed across all models", { error: lastError });
  const output = fallback(input);
  return NextResponse.json({
    ...output,
    destination: destinationForGeneratedContent(generationContext(input), output.body),
    mode: "fallback",
    style: "premium-facebook"
  });
}
