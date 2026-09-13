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
  "small-group": "a small mixed-gender group of three fictional Black African students or health professionals",
  clinician: "one fictional Black African clinician",
  student: "one fictional Black African university student"
};

const scenes: Record<string, string> = {
  "research-work": "working on a health research project with a laptop and one notebook",
  "clinical-learning": "taking part in a professional medical learning session without a real patient",
  "student-study": "studying medical or nursing material with a laptop or a single notebook",
  "exam-prep": "preparing for MedMinds Prep revision with generic notes and question-practice cues",
  "data-analysis": "reviewing a clean research dashboard or statistical output with no private data visible",
  teaching: "taking part in a small teaching or mentorship session",
  "digital-health": "using a contemporary digital health or education platform",
  "neutral-portrait": "in a natural editorial environmental portrait"
};

const settings: Record<string, string> = {
  "modern-office": "a clean contemporary office with soft daylight",
  university: "a modern African university learning environment",
  "clinical-classroom": "a simple clinical skills or medical teaching room",
  library: "a bright uncluttered university library or quiet study area",
  workspace: "a clean believable professional workspace",
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

function compact(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim();
  return `${clipped || clean.slice(0, max - 1).trim()}…`;
}

function cleanSupport(body: string) {
  const clean = body.replace(/#[A-Za-z0-9_]+/g, "").replace(/\s+/g, " ").trim();
  return compact(clean.split(/(?<=[.!?])\s+/)[0] || clean, 140);
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
    const headline = compact(input.headline || post.creativeHeadline || post.title || "MedMinds", 54);
    const supportingText = compact(input.supportingText || post.creativeSupportingText || cleanSupport(post.body), 140);
    const cta = compact(input.cta || post.creativeCta || "Message MedMinds", 28);
    const preset = `${subjects[input.subject]} ${scenes[input.scene]} in ${settings[input.setting]}, appearing ${moods[input.mood]}, photographed as ${styles[input.style]}.`;
    const direction = compact(input.extraDirection || preset, 1800);

    const prompt = `Create a highly photorealistic premium advertising photograph for MedMinds Learning Centre in Zambia. ${direction}

Match the visual character of the existing MedMinds Learning Centre Facebook feed. Compose a SQUARE 1:1 photograph intended for a 1080 x 1080 post. The scene must feel clean, academic-medical, calm and premium rather than busy. Use soft teal/blue-neutral environmental tones where natural, realistic daylight, shallow depth of field and restrained contrast.

LAYOUT FOR THE MEDMINDS OVERLAY
- Keep the main person, face and important action in the RIGHT 45% of the square frame.
- Keep the LEFT 50% as genuine negative space for a white information card and navy headline.
- Keep faces away from the canvas edges and away from the future text area.
- Use one main subject whenever possible. A pair or small group must remain visually grouped on the right.
- Use only the minimum props needed to explain the activity: at most one laptop/tablet and one notebook or simple teaching prop.
- Keep the background softly blurred and simple. Avoid crowded desks, stacks of books, anatomy-poster clutter, charts, busy shelves, decorative wall text, bright signs and multiple competing objects.

QUALITY AND PRIVACY
- Use realistic Black African adults and natural expressions, skin texture and believable hands.
- Use fictional people only; do not resemble public figures, real students, real clinicians or real patients.
- Do not include visible logos, watermarks, promotional typography, readable private records, patient information, student IDs, examination papers, answer keys or confidential assessment material.
- For MedMinds Prep scenes, show revision activity rather than an examination in progress.
- The raw photograph itself must contain no MedMinds branding because the consistent Facebook Page branding is added by the renderer afterward.`;

    const result = await generateImage({
      model: gateway.imageModel("openai/gpt-image-2"),
      prompt,
      aspectRatio: "1:1",
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

    return NextResponse.json({
      ...updated,
      hasRealisticPhoto: true,
      previewUrl,
      photoUrl,
      imageModel: "openai/gpt-image-2",
      dimensions: "1080x1080",
      visualSystem: "MedMinds Facebook house style"
    });
  } catch (error) {
    console.error("MedMinds realistic image generation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate the realistic image.", retryable: true }, { status: 502 });
  }
}
