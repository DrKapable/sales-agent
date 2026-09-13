import { NextResponse } from "next/server";
import { z } from "zod";
import { contentStatuses, listContentPosts, saveContentPost, type ContentPost } from "@/lib/content-studio";

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  contentType: z.string().trim().min(2).max(100),
  objective: z.string().trim().max(500).nullable().optional(),
  audience: z.string().trim().max(350).nullable().optional(),
  body: z.string().trim().min(2).max(10000),
  mediaUrl: z.string().trim().url().nullable().optional(),
  status: z.enum(contentStatuses).optional(),
  approvedBy: z.string().trim().max(120).nullable().optional()
});

function adminView(post: ContentPost) {
  const hasRealisticPhoto = Boolean(post.photoGeneratedAt && post.photoVersion > 0);
  return {
    ...post,
    hasRealisticPhoto,
    photoUrl: hasRealisticPhoto ? `/api/content/photo/${post.id}?v=${post.photoVersion}` : null,
    previewUrl: post.mediaUrl ? `/api/content/creative/${post.id}?v=${post.creativeVersion}` : null
  };
}

export async function GET() {
  return NextResponse.json({ posts: (await listContentPosts(150)).map(adminView) });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid content post." }, { status: 400 });
  return NextResponse.json(adminView(await saveContentPost(parsed.data)));
}
