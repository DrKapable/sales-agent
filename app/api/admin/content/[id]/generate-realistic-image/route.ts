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
  headline: z.string().trim().max(90).optional(),
  supportingText: z.string().trim().max(180).optional(),
  cta: z.string().trim().max(48).optional(),
  extraDirection: z.string().trim().max(1200).optional().default("")
});

const subjectMap: Record<string, string> = {
  woman: "one fictional Black African woman aged about 23-42",
  man: "one fictional Black African man aged about 23-45",
  "mixed-pair": "two fictional Black African adults, one woman and one man, aged about 23-45",
  "small-group": "a small mixed-gender group of three fictional Black African students or health professionals aged about 22-42",
  clinician: "one fictional Black African clinician aged about 27-45 in professional but non-identifiable attire",
  student: "one fictional Black African university student aged about 21-32"
};

const sceneMap: Record<string, string> = {
  "research-work": "working thoughtfully on a health research project with a laptop, notebook and non-identifiable charts or papers",
  "clinical-learning": "participating in a professional medical learning session using a tablet, notebook or teaching image without showing a real patient",
  "student-study": "studying medical or nursing material in a focused, realistic university setting",
  "exam-prep": "preparing for a medical or nursing examination using generic revision notes, a laptop or tablet, question-practice cues and an OSCE-style study environment without showing any real examination paper, answer key or confidential assessment material",
  "data-analysis": "reviewing a clean research dashboard, spreadsheet or statistical output on a laptop with no private data visible",
  teaching: "a small teaching or mentorship interaction around a laptop or whiteboard with natural body language",
  "digital-health": "using a contemporary digital health or education platform on a laptop or tablet in a credible professional setting",
  "neutral-portrait": "an editorial environmental portrait with relaxed posture and a believable candid expression"
};

const settingMap: Record<string, string> = {
  "modern-office": "a clean contemporary office with modest furnishings and soft daylight",
  university: "a modern African university learning environment with desks, notebooks and subtle academic context",
  "clinical-classroom": "a clinical skills or medical teaching room with educational equipment but no identifiable patient",
  library: "a bright university library or quiet study area",
  workspace: "a believable professional workspace with a laptop and research materials",
  "urban-outdoor": "a contemporary Southern African urban campus or professional outdoor setting with no identifiable landmarks"
};

const moodMap: Record<string, string> = {
  confident: "calm confidence and competence",
  approachable: "friendly, approachable and trustworthy energy",
  focused: "focused, purposeful and composed energy",
  curious: "intellectual curiosity and active learning",
  warm: "warm human connection with natural expressions"
};

const styleMap: Record<string, string> = {
  editorial: "premium editorial commercial photography with realistic skin texture, natural depth of field and restrained colour grading",
  lifestyle: "high-end lifestyle photography with candid composition, natural light and authentic expressions",
  premium: "polished premium commercial photography with sophisticated lighting while remaining believable and accessible",
  documentary: "refined documentary-style photography with candid realism, natural gestures and minimal posing"
};

function cleanSupport(body: string) {
  const clean = body.replace(/#[A-Za-z0-9_]+/g, "").replace(/\s+/g, " ").trim();
  return clean.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 1).join(" ").slice(0, 165);
}

function publicOrigin(request: Request) {
  const configured = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const post = await getContentPost(id);
    if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid realistic image settings." }, { status: 400 });
    const input = parsed.data;

    const derivedDirection = `${subjectMap[input.subject]}; ${sceneMap[input.scene]}; ${settingMap[input.setting]}; mood: ${moodMap[input.mood]}; ${styleMap[input.style]}.`;
    const primaryDirection = input.extraDirection || derivedDirection;
    const prompt = `Create a highly photorealistic premium advertising photograph for MedMinds Learning Centre, a medical education, research-support and digital-health brand based in Zambia. MedMinds Prep is its examination-preparation product.

PRIMARY CREATIVE DIRECTION
${primaryDirection}

SECONDARY CAST AND STYLE GUIDANCE
${derivedDirection}
If the primary direction specifies the subject, setting, activity, props, clothing, camera framing or mood, it overrides the secondary presets.

FACEBOOK CREATIVE COMPOSITION — VERY IMPORTANT
- The final branded creative will be cropped to 1200 x 628 (about 1.91:1), so compose the photograph to survive a wide crop.
- Place the principal person, face and important action clearly in the RIGHT 45% of the frame.
- Keep the LEFT 48% visually calm, low-detail and free of faces, hands, screens, books with readable text, bright highlights or important objects. This is the protected text-safe zone.
- Keep the principal face inside the centre-right safe area, not near the top, bottom or right edge.
- Avoid putting a second face behind the future text area. If there is a pair or group, keep all faces mostly on the right half.
- Prefer clean depth separation, uncluttered backgrounds, realistic daylight and crisp facial focus.
- No baked-in text, logos, posters with readable wording, watermarks, UI labels or promotional typography in the raw photograph.
- Real-camera realism, natural skin texture and believable hands. Avoid CGI, illustration, oversmoothing and artificial glossy skin.

MEDICAL, ACADEMIC AND PRIVACY SAFEGUARDS
- Use entirely fictional adults; do not resemble public figures, real students, real clinicians or real patients.
- Do not show identifiable patient faces, patient charts, names, phone numbers, student IDs, examination papers, confidential records or real research data.
- For MedMinds Prep scenes, show revision activity rather than an actual examination in progress. Generic educational props are acceptable; real or realistic leaked exam papers, answers, marking keys and confidential assessments are not.
- Avoid graphic procedures, distress, illness, blood, needles, operating scenes or sensational medical imagery unless explicitly requested for a safe educational purpose.
- Do not show fake certificates, fabricated journal covers, guaranteed-results language, exam answers or plagiarism/cheating cues.
- No visible MedMinds logo, company name, watermarks or promotional text inside the raw photograph; branding is added separately.
- Keep the scene dignified, intellectually credible, modern and locally believable.`;

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
    const mediaUrl = `${publicOrigin(request)}${previewUrl}`;
    const photoUrl = `/api/content/photo/${post.id}?v=${photoVersion}`;

    await saveContentPhoto(post.id, generated.base64, generated.mediaType || "image/png", prompt, photoVersion);
    const updated = await saveContentPost({
      ...post,
      mediaUrl,
      creativeVisualMode: "photo",
      creativeHeadline: input.headline || post.creativeHeadline || post.title.slice(0, 90),
      creativeSupportingText: input.supportingText || post.creativeSupportingText || cleanSupport(post.body),
      creativeCta: input.cta || post.creativeCta || "Message MedMinds",
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
