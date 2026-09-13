import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentPost, saveContentPost } from "@/lib/content-studio";
import { getCreativeSettings, saveCreativeSettings } from "@/lib/content-creative-settings";
import { creativeLayoutVariants } from "@/lib/content-creative-layout";
import { normalizeMedMindsBranding } from "@/lib/medminds-brand";

const schema = z.object({
  template: z.enum(["promo-clean", "education-card", "faq-notice"]).optional(),
  headline: z.string().trim().max(120).optional(),
  supportingText: z.string().trim().max(320).optional(),
  cta: z.string().trim().max(60).optional(),
  textScale: z.number().min(0.75).max(1.25).optional(),
  supportLines: z.number().int().min(0).max(3).optional(),
  photoX: z.number().int().min(0).max(100).optional(),
  photoY: z.number().int().min(0).max(100).optional(),
  photoZoom: z.number().min(1).max(1.45).optional(),
  cardOpacity: z.number().min(0.72).max(1).optional(),
  logoPosition: z.enum(["left", "center"]).optional(),
  textAlign: z.enum(["left", "center"]).optional(),
  showWebsite: z.boolean().optional(),
  layoutVariant: z.enum(creativeLayoutVariants).optional()
});

function originFor(request: Request) {
  return process.env.PUBLIC_URL?.trim().replace(/\/+$/, "") || new URL(request.url).origin;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = await getContentPost(id);
  if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });
  return NextResponse.json({
    post,
    settings: await getCreativeSettings(id),
    previewUrl: `/api/content/creative/${id}?v=${post.creativeVersion || 1}`,
    photoUrl: post.photoGeneratedAt ? `/api/content/photo/${id}?v=${post.photoVersion || 1}` : null
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const post = await getContentPost(id);
    if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });
    if (!post.creativeGeneratedAt && !post.mediaUrl) return NextResponse.json({ error: "Generate a creative first, then use the manual editor." }, { status: 409 });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid manual creative settings.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const input = parsed.data;
    const version = Math.max(1, (post.creativeVersion || 1) + 1);
    const previewUrl = `/api/content/creative/${id}?v=${version}`;

    const settings = await saveCreativeSettings(id, input);
    const updated = await saveContentPost({
      ...post,
      creativeTemplate: input.template || post.creativeTemplate,
      creativeHeadline: input.headline !== undefined ? normalizeMedMindsBranding(input.headline) : post.creativeHeadline,
      creativeSupportingText: input.supportingText !== undefined ? normalizeMedMindsBranding(input.supportingText) : post.creativeSupportingText,
      creativeCta: input.cta !== undefined ? normalizeMedMindsBranding(input.cta) : post.creativeCta,
      creativeGeneratedAt: new Date().toISOString(),
      creativeVersion: version,
      mediaUrl: `${originFor(request)}${previewUrl}`
    });

    return NextResponse.json({ post: updated, settings, previewUrl });
  } catch (error) {
    console.error("Unable to save MedMinds creative edits", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save creative edits." }, { status: 400 });
  }
}
