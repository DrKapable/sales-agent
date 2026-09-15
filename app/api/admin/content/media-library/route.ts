import { NextResponse } from "next/server";
import {
  contentMediaCategories,
  deleteContentMediaAsset,
  listContentMediaAssets,
  normalizeContentMediaCategory,
  saveContentMediaAsset
} from "@/lib/content-media-library";
import {
  hasContentVisualSignature,
  MAX_CONTENT_VISUAL_BYTES,
  resolveContentVisualMime,
  sanitizeContentVisualFilename
} from "@/lib/content-visual-upload";

export const runtime = "nodejs";
export const maxDuration = 30;

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "MedMinds visual";
}

function adminView<T extends { id: string }>(asset: T) {
  return { ...asset, imageUrl: `/api/content/media-library/${asset.id}` };
}

export async function GET() {
  const assets = await listContentMediaAssets(180);
  return NextResponse.json({ assets: assets.map(adminView), categories: contentMediaCategories });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Upload a valid media-library image." }, { status: 400 });

    const value = form.get("file");
    if (!(value instanceof File)) return NextResponse.json({ error: "Choose an image to add to the media library." }, { status: 400 });
    if (value.size <= 0) return NextResponse.json({ error: "The selected image is empty." }, { status: 400 });
    if (value.size > MAX_CONTENT_VISUAL_BYTES) {
      return NextResponse.json({ error: `Images are limited to ${Math.round(MAX_CONTENT_VISUAL_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
    }

    const fileName = sanitizeContentVisualFilename(value.name);
    const mimeType = resolveContentVisualMime(fileName, value.type);
    if (!mimeType) return NextResponse.json({ error: "Unsupported image type. Use PNG, JPG, JPEG or WebP." }, { status: 415 });

    const bytes = new Uint8Array(await value.arrayBuffer());
    if (!hasContentVisualSignature(bytes, mimeType)) {
      return NextResponse.json({ error: "The selected file does not contain a valid PNG, JPEG or WebP image." }, { status: 415 });
    }

    const category = normalizeContentMediaCategory(form.get("category"));
    const title = String(form.get("title") || "").trim().slice(0, 180) || titleFromFileName(fileName);
    const altText = String(form.get("altText") || "").trim().slice(0, 300) || null;
    const tags = String(form.get("tags") || "").trim();

    const asset = await saveContentMediaAsset({
      title,
      category,
      fileName,
      mimeType,
      base64: Buffer.from(bytes).toString("base64"),
      altText,
      tags,
      createdBy: "MedMinds Admin"
    });
    const { base64: _base64, ...metadata } = asset;
    return NextResponse.json({ asset: adminView(metadata) }, { status: 201 });
  } catch (error) {
    console.error("MedMinds media library upload failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add the image to the media library." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Media asset ID is required." }, { status: 400 });
  const deleted = await deleteContentMediaAsset(id);
  if (!deleted) return NextResponse.json({ error: "Media asset not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
