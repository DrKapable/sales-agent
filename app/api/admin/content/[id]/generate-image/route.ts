import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentPost, saveContentPost, type CreativeTemplate } from "@/lib/content-studio";
import { normalizeMedMindsBranding } from "@/lib/medminds-brand";

const schema = z.object({
  template: z.enum(["promo-clean", "education-card", "faq-notice"]).optional(),
  headline: z.string().trim().max(500).optional(),
  supportingText: z.string().trim().max(1200).optional(),
  cta: z.string().trim().max(160).optional()
});

function compact(value: string, max: number) {
  const clean = normalizeMedMindsBranding(value).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim();
  return `${clipped || clean.slice(0, max - 1).trim()}…`;
}

function deriveSupport(body: string) {
  const clean = normalizeMedMindsBranding(body).replace(/#[A-Za-z0-9_]+/g, "").replace(/\s+/g, " ").trim();
  return compact(clean.split(/(?<=[.!?])\s+/)[0] || clean, 140);
}

function deriveTemplate(contentType: string): CreativeTemplate {
  const value = normalizeMedMindsBranding(contentType).toLowerCase();
  if (value.includes("faq") || value.includes("announcement") || value.includes("myth")) return "faq-notice";
  if (value.includes("education") || value.includes("tip") || value.includes("research") || value.includes("clinical")) return "education-card";
  return "promo-clean";
}

function deriveCta(contentType: string) {
  const value = normalizeMedMindsBranding(contentType).toLowerCase();
  if (value.includes("engagement")) return "Join the conversation";
  if (value.includes("course")) return "Learn with MedMinds";
  if (value.includes("medminds prep") || value.includes("exam")) return "Try MedMinds Prep";
  return "Message MedMinds";
}

function publicOrigin(request: Request) {
  return process.env.PUBLIC_URL?.trim().replace(/\/+$/, "") || new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = await getContentPost(id);
  if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid creative settings.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  const input = parsed.data;
  const version = Math.max(1, (post.creativeVersion || 1) + 1);
  const template = input.template || post.creativeTemplate || deriveTemplate(post.contentType);

  // Facebook house-style guardrails from the current MedMinds Page audit.
  // Keep copy intentionally short; the caption carries the detail while the creative stays clean.
  const headline = compact(input.headline || post.creativeHeadline || post.title, 54);
  const supportingText = compact(input.supportingText || post.creativeSupportingText || deriveSupport(post.body), 155);
  const cta = compact(input.cta || post.creativeCta || deriveCta(post.contentType), 28);
  const previewUrl = `/api/content/creative/${post.id}?v=${version}`;
  const mediaUrl = `${publicOrigin(request)}${previewUrl}`;

  const updated = await saveContentPost({
    ...post,
    mediaUrl,
    creativeVisualMode: "graphic",
    creativeTemplate: template,
    creativeHeadline: headline,
    creativeSupportingText: supportingText,
    creativeCta: cta,
    creativeGeneratedAt: new Date().toISOString(),
    creativeVersion: version
  });

  return NextResponse.json({
    ...updated,
    previewUrl,
    facebookReady: true,
    dimensions: "1080x1080",
    visualSystem: "MedMinds Facebook house style"
  });
}
