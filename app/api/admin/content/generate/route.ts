import { gateway, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiModelCandidates } from "@/lib/env";
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
  brandVoice: z.string().trim().max(1000).optional().default("Credible, practical, academically grounded, warm and concise. Sound like an experienced MedMinds educator and research-support professional. Use clear Zambian English where appropriate and avoid hype."),
  existingBody: z.string().trim().max(10000).optional().default(""),
  action: z.enum(["generate", "humanise", "strengthen-hook", "shorten"]).default("generate"),
  variationCount: z.number().int().min(1).max(3).default(3)
});

function fallback(input: z.infer<typeof schema>) {
  const audience = input.audience ? `For ${input.audience}. ` : "";
  const base = `${input.objective}\n\n${audience}MedMinds provides practical learning, research and academic support designed to help students and professionals work more confidently. Message MedMinds for the most appropriate next step.`;
  return {
    body: base,
    alternatives: [base],
    headline: input.objective.slice(0, 76),
    imageBrief: "Clean MedMinds visual in deep green, cream and white, showing a credible African medical, academic or research context with one clear message."
  };
}

function parseOutput(text: string, wanted: number) {
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

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid content generation request." }, { status: 400 });

  const offers = (await listOffers()).filter((offer) => offer.active).map((offer) => ({
    name: offer.name,
    category: offer.category,
    description: offer.description,
    features: offer.features,
    priceZmw: offer.priceZmw,
    rushPriceZmw: offer.rushPriceZmw
  }));

  const input = parsed.data;
  const lengthGuide = input.length === "short" ? "180-380 characters" : input.length === "long" ? "700-1200 characters" : "350-750 characters";
  const actionGuide = input.action === "humanise"
    ? `Rewrite the supplied caption so it sounds natural, specific and human while preserving factual claims. Existing caption: ${input.existingBody}`
    : input.action === "strengthen-hook"
      ? `Rewrite the supplied caption with a stronger but credible opening. Avoid clickbait. Existing caption: ${input.existingBody}`
      : input.action === "shorten"
        ? `Shorten the supplied caption without losing important information. Existing caption: ${input.existingBody}`
        : "Create new content from the brief.";

  const instructions = `You are the senior content editor for MedMinds Learning Centre, a Zambia-based medical education, research-support and digital-services brand. Every draft is reviewed by an authenticated administrator before publication.

BRAND VOICE
${input.brandVoice}

WRITING STANDARD
- Write like a knowledgeable MedMinds educator or research-support professional, not a generic marketing bot.
- Use clear, concrete language, natural sentence rhythm and short mobile-friendly paragraphs.
- Avoid generic openings such as "In today's fast-paced world", "Unlock your potential", "Transform your journey", "Are you struggling with", "Whether you're" and "Take your skills to the next level".
- Avoid buzzwords, fake urgency, excessive exclamation marks and repetitive emoji bullets.
- Most posts should use no emojis. Use at most two when they genuinely improve scanning.
- Use zero to three relevant hashtags only when natural.
- Write in accessible English appropriate to Zambia while remaining useful to an international audience.

ACADEMIC, CLINICAL AND ETHICAL SAFEGUARDS
- Use only facts supplied in the request and the approved MedMinds catalogue below.
- Never invent citations, journals, guidelines, pass rates, testimonials, student numbers, institutional partnerships, clinical outcomes, publication acceptance rates or accreditation claims.
- Do not guarantee exam success, dissertation approval, publication, grades, research findings or turnaround times unless explicitly present in the approved catalogue.
- Do not present educational content as patient-specific medical advice. When a clinical topic could reasonably be read as treatment advice, frame it as education for learners and professionals.
- Do not advertise plagiarism concealment, cheating, fabricated data, ghost authorship or evasion of academic integrity systems.
- Do not claim AI-generated work is undetectable or promise a specific AI-detection score.
- If a claim is unsupported, omit it instead of guessing.
- When a price is mentioned, use only the exact approved catalogue information and state ranges accurately.

MEDMINDS CONTENT PRIORITIES
- Research: proposal development, dissertation/thesis support, manuscript support, data collection tools, quantitative/qualitative/mixed-methods analysis, editing and research training.
- Learning: Pa Gym theory, OSCE and NMCZ/preclinical preparation; medical courses; ECG, chest X-ray and OSCE revision.
- Digital: ZaTafa MedStats, web/software development and WhatsApp automation where relevant.
- Educational posts should teach something useful before selling.
- Promotional posts should explain who the service is for, the practical benefit and one simple next step.

CREATIVE DIRECTION
- Requested angle: ${input.angle}.
- Requested tone: ${input.tone}.
- Requested length: ${lengthGuide}.
- CTA preference: ${input.cta}.
- Create ${input.variationCount} genuinely different caption option${input.variationCount === 1 ? "" : "s"}. Change the opening, structure and CTA, not just a few words.
- Also write one short headline and one image brief suitable for a branded graphic or realistic image generation.
- Visual direction should favour contemporary African medical, academic, research and technology contexts. Avoid fake certificates, visible private patient data, graphic medical imagery and stereotyped settings.

OUTPUT FORMAT
Return plain text using these exact markers and no Markdown fences:
[[HEADLINE]]
<short creative headline>
[[CAPTION_1]]
<caption>
${input.variationCount >= 2 ? "[[CAPTION_2]]\n<different caption>\n" : ""}${input.variationCount >= 3 ? "[[CAPTION_3]]\n<different caption>\n" : ""}[[IMAGE_BRIEF]]
<visual direction under 320 characters>

APPROVED MEDMINDS CATALOGUE
${JSON.stringify(offers)}`;

  const prompt = `Task: ${actionGuide}\nContent type: ${input.contentType}\nObjective: ${input.objective}\nAudience: ${input.audience}\nTone: ${input.tone}\nAngle: ${input.angle}\nLength: ${input.length}\nCTA: ${input.cta}\nAdditional instructions: ${input.notes || "None"}`;
  let lastError: unknown = null;
  for (const model of getAiModelCandidates()) {
    try {
      const agent = new ToolLoopAgent({ model: gateway(model), instructions, tools: {} });
      const result = await agent.generate({ prompt });
      const output = parseOutput(result.text, input.variationCount);
      if (output.body) return NextResponse.json({ ...output, model, mode: "agent" });
    } catch (error) {
      lastError = error;
      console.warn("MedMinds content generation attempt failed", { model, error });
    }
  }
  console.error("MedMinds content generation failed across all models", { error: lastError });
  return NextResponse.json({ ...fallback(input), mode: "fallback" });
}
