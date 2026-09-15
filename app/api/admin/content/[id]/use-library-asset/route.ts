import { NextResponse } from "next/server";
import { z } from "zod";
import { contentMediaCategoryLabel, getContentMediaAsset, markContentMediaAssetUsed } from "@/lib/content-media-library";
import { getContentPost, saveContentPhoto, saveContentPost } from "@/lib/content-studio";

export const runtime = "nodejs";

const schema = z.object({ assetId: z.string().uuid() });

function publicOrigin(request: Request) {
  return process.env.PUBLIC_URL?.trim().replace(/\/+$/, "") || new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const post = await getContentPost(id);
    if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid media-library asset." }, { status: 400 });

    const asset = await getContentMediaAsset(parsed.data.assetId);
    if (!asset) return NextResponse.json({ error: "Media-library asset not found." }, { status: 404 });

    const photoVersion = Math.max(1, (post.photoVersion || 1) + 1);
    const creativeVersion = Math.max(1, (post.creativeVersion || 1) + 1);
    const previewUrl = `/api/content/creative/${post.id}?v=${creativeVersion}`;
    const photoUrl = `/api/content/photo/${post.id}?v=${photoVersion}`;
    const now = new Date().toISOString();
    const prompt = `Media library asset: ${contentMediaCategoryLabel(asset.category)}: ${asset.title} [${asset.id}]`;

    await saveContentPhoto(post.id, asset.base64, asset.mimeType, prompt, photoVersion);
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
    const usage = await markContentMediaAssetUsed(asset.id);

    return NextResponse.json({
      ...updated,
      previewUrl,
      photoUrl,
      mediaAsset: {
        id: asset.id,
        title: asset.title,
        category: asset.category,
        usageCount: usage?.usageCount ?? asset.usageCount + 1
      }
    });
  } catch (error) {
    console.error("Unable to apply MedMinds media-library asset", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to use the selected media-library asset." }, { status: 500 });
  }
}
