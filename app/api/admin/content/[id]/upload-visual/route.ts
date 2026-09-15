import { NextResponse } from "next/server";
import { getContentPost, saveContentPhoto, saveContentPost } from "@/lib/content-studio";
import {
  contentVisualPrompt,
  MAX_CONTENT_VISUAL_BYTES,
  normalizeContentVisualKind,
  resolveContentVisualMime,
  sanitizeContentVisualFilename
} from "@/lib/content-visual-upload";

export const runtime = "nodejs";
export const maxDuration = 30;

function publicOrigin(request: Request) {
  return process.env.PUBLIC_URL?.trim().replace(/\/+$/, "") || new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const post = await getContentPost(id);
    if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Upload a valid image." }, { status: 400 });

    const value = form.get("file");
    if (!(value instanceof File)) return NextResponse.json({ error: "Choose a screenshot or photo to upload." }, { status: 400 });
    if (value.size <= 0) return NextResponse.json({ error: "The selected image is empty." }, { status: 400 });
    if (value.size > MAX_CONTENT_VISUAL_BYTES) {
      return NextResponse.json({ error: `Images are limited to ${Math.round(MAX_CONTENT_VISUAL_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
    }

    const fileName = sanitizeContentVisualFilename(value.name);
    const mimeType = resolveContentVisualMime(fileName, value.type);
    if (!mimeType) {
      return NextResponse.json({ error: "Unsupported image type. Use PNG, JPG, JPEG or WebP." }, { status: 415 });
    }

    const kind = normalizeContentVisualKind(form.get("kind"));
    const bytes = Buffer.from(await value.arrayBuffer());
    const photoVersion = Math.max(1, (post.photoVersion || 1) + 1);
    const creativeVersion = Math.max(1, (post.creativeVersion || 1) + 1);
    const previewUrl = `/api/content/creative/${post.id}?v=${creativeVersion}`;
    const photoUrl = `/api/content/photo/${post.id}?v=${photoVersion}`;
    const prompt = contentVisualPrompt(kind, fileName);
    const now = new Date().toISOString();

    await saveContentPhoto(post.id, bytes.toString("base64"), mimeType, prompt, photoVersion);
    const updated = await saveContentPost({
      ...post,
      mediaUrl: `${publicOrigin(request)}${previewUrl}`,
      creativeVisualMode: "photo",
      creativeGeneratedAt: now,
      creativeVersion,
      photoPrompt: prompt,
      photoGeneratedAt: now,
      photoVersion
    });

    return NextResponse.json({
      ...updated,
      previewUrl,
      photoUrl,
      visualSource: "uploaded",
      visualKind: kind,
      fileName,
      mimeType
    });
  } catch (error) {
    console.error("MedMinds authentic visual upload failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload the visual." }, { status: 500 });
  }
}
