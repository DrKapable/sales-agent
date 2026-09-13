import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentPost, saveContentPost, type CreativeTemplate } from "@/lib/content-studio";
import { normalizeMedMindsBranding } from "@/lib/medminds-brand";

const schema = z.object({
  template: z.enum(["promo-clean", "education-card", "faq-notice"]).optional(),
  headline: z.string().trim().max(90).optional(),
  supportingText: z.string().trim().max(180).optional(),
  cta: z.string().trim().max(48).optional()
});

function deriveSupport(body: string) {
  const clean = normalizeMedMindsBranding(body).replace(/#[A-Za-z0-9_]+/g, "").replace(/\s+/g, " ").trim();
  return (clean.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 1).join(" ") || clean).slice(0, 165).trim();
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
  const configured = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = await getContentPost(id);
  if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid creative settings. Keep the headline, supporting text and CTA concise for a readable Facebook graphic." }, { status: 400 });

  const input = parsed.data;
  const version = Math.max(1, (post.creativeVersion || 1) + 1);
  const template = input.template || post.creativeTemplate || deriveTemplate(post.contentType);
  const headline = normalizeMedMindsBranding(input.headline || post.creativeHeadline || post.title.slice(0, 90));
  const supportingText = normalizeMedMindsBranding(input.supportingText || post.creativeSupportingText || deriveSupport(post.body));
  const cta = normalizeMedMindsBranding(input.cta || post.creativeCta || deriveCta(post.contentType));
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
  return NextResponse.json({ ...updated, previewUrl, facebookReady: true, dimensions: "1200x628" });
}
