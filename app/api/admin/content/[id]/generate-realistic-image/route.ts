import { gateway } from "@ai-sdk/gateway";
import { generateImage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentPost, saveContentPhoto, saveContentPost } from "@/lib/content-studio";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  scene: z.enum(["research-work", "clinical-learning", "student-study", "exam-prep", "data-analysis", "teaching", "digital-health", "neutral-portrait"]).default("research-work"),
  subject: z.enum(["woman", "man", "mixed-pair", "small-group", "clinician", "student"]).default("woman"),
  setting: z.enum(["modern-office", "university", "clinical-classroom", "library", "workspace", "urban-outdoor"]).default("modern-office"),
  mood: z.enum(["confident", "approachable", "focused", "curious", "warm"]).default("focused"),
  style: z.enum(["editorial", "lifestyle", "premium", "documentary"]).default("editorial"),
  headline: z.string().trim().max(500).optional(),
  supportingText: z.string().trim().max(1200).optional(),
  cta: z.string().trim().max(160).optional(),
  extraDirection: z.string().trim().max(4000).optional().default("")
});

const subjects: Record<string, string> = {
  woman: "one fictional Black African woman",
  man: "one fictional Black African man",
  "mixed-pair": "two fictional Black African adults, one woman and one man",
  "small-group": "a small mixed-gender group of fictional Black African students or health professionals",
  clinician: "one fictional Black African clinician",
  student: "one fictional Black African university student"
};

const scenes: Record<string, string> = {
  "research-work": "working on a health research project with a laptop and notebook",
  "clinical-learning": "taking part in a professional medical learning session without a real patient",
  "student-study": "studying medical or nursing material",
  "exam-prep": "preparing for MedMinds Prep revision with generic notes, question practice and OSCE study cues",
  "data-analysis": "reviewing a clean research dashboard or statistical output with no private data visible",
  teaching: "taking part in a small teaching or mentorship session",
  "digital-health": "using a contemporary digital health or education platform",
  "neutral-portrait": "in a natural editorial environmental portrait"
};

const settings: Record<string, string> = {
  "modern-office": "a clean contemporary office with soft daylight",
  university: "a modern African university learning environment",
  "clinical-classroom": "a clinical skills or medical teaching room",
  library: "a bright university library or quiet study area",
  workspace: "a believable professional workspace",
  "urban-outdoor": "a contemporary Southern African campus or professional outdoor setting"
};

const moods: Record<string, string> = {
  confident: "calm and confident",
  approachable: "friendly and approachable",
  focused: "focused and purposeful",
  curious: "curious and actively learning",
  warm: "warm and human"
};

const styles: Record<string, string> = {
  editorial: "premium editorial commercial photography",
  lifestyle: "high-end candid lifestyle photography",
  premium: "polished premium commercial photography",
  documentary: "refined documentary-style photography"
};

function cleanSupport(body: string) {
  const clean = body.replace(/#[A-Za-z0-9_]+/g, "").replace(/\s+/g, " ").trim();
  return (clean.split(/(?<=[.!?])\s+/)[0] || clean).slice(0, 165);
}

function publicOrigin(request: Request) {
  return process.env.PUBLIC_URL?.trim().replace(/\/+$/, "") || new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const post = await getContentPost(id);
    if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      console.warn("Invalid MedMinds realistic image settings", parsed.error.flatten());
      return NextResponse.json({ error: "Invalid realistic image settings.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const input = parsed.data;
    const headline = (input.headline || post.creativeHeadline || post.title || "MedMinds").trim().slice(0, 90);
    const supportingText = (input.supportingText || post.creativeSupportingText || cleanSupport(post.body)).trim().slice(0, 165);
    const cta = (input.cta || post.creativeCta || "Message MedMinds").trim().slice(0, 48);
    const preset = `${subjects[input.subject]} ${scenes[input.scene]} in ${settings[input.setting]}, appearing ${moods[input.mood]}, photographed as ${styles[input.style]}.`;
    const direction = (input.extraDirection || preset).trim().slice(0, 1800);

    const prompt = `Create a highly photorealistic premium advertising photograph for MedMinds Learning Centre in Zambia. ${direction}

Compose it for a 1200 x 628 Facebook creative. Keep the main person, face and important action in the right half of the frame. Keep the left half calm and uncluttered so branded text can be added later. Use realistic skin texture, believable hands, natural expressions and professional lighting. Use fictional adults only. Do not include visible logos, watermarks, promotional text, identifiable private records, patient information or confidential assessment material. For MedMinds Prep scenes, show revision activity rather than an examination in progress. The raw photograph itself must contain no MedMinds branding because the overlay is added separately.`;

    const result = await generateImage({
      model: gateway.imageModel("openai/gpt-image-2"),
      prompt,
      aspectRatio: "3:2",
      maxRetries: 1
    });
    const generated = result.images?.[0] ?? result.image;
    if (!generated?.base64) throw new Error("The image service returned no image data. Please regenerate.");

    const photoVersion = Math.max(1, (post.photoVersion || 1) + 1);
    const creativeVersion = Math.max(1, (post.creativeVersion || 1) + 1);
    const previewUrl = `/api/content/creative/${post.id}?v=${creativeVersion}`;
    const photoUrl = `/api/content/photo/${post.id}?v=${photoVersion}`;

    await saveContentPhoto(post.id, generated.base64, generated.mediaType || "image/png", prompt, photoVersion);
    const updated = await saveContentPost({
      ...post,
      mediaUrl: `${publicOrigin(request)}${previewUrl}`,
      creativeVisualMode: "photo",
      creativeHeadline: headline,
      creativeSupportingText: supportingText,
      creativeCta: cta,
      creativeGeneratedAt: new Date().toISOString(),
      creativeVersion,
      photoPrompt: prompt,
      photoScene: input.scene,
      photoSubject: input.subject,
      photoSetting: input.setting,
      photoMood: input.mood,
      photoStyle: input.style,
      photoGeneratedAt: new Date().toISOString(),
      photoVersion
    });

    return NextResponse.json({ ...updated, hasRealisticPhoto: true, previewUrl, photoUrl, imageModel: "openai/gpt-image-2" });
  } catch (error) {
    console.error("MedMinds realistic image generation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate the realistic image.", retryable: true }, { status: 502 });
  }
}
