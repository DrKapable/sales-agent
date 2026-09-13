import { getContentPost } from "@/lib/content-studio";

export async function createContentSnapshot(request: Request, postId: string) {
  const post = await getContentPost(postId);
  if (!post) throw new Error("Content post not found.");
  if (post.status !== "APPROVED") throw new Error("Approve this content before scheduling it on Facebook.");
  if (!post.creativeGeneratedAt) throw new Error("Generate and review a creative image before scheduling this post.");
  if (!post.body.trim()) throw new Error("The Facebook caption is empty.");

  // The creative renderer is authoritative. Older approved posts may have lost mediaUrl
  // during a status-only save, but their generated creative metadata is still intact.
  const origin = new URL(request.url).origin;
  const sourceMediaUrl = `${origin}/api/content/creative/${post.id}?v=${post.creativeVersion || 1}`;
  const response = await fetch(sourceMediaUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to snapshot the generated creative (HTTP ${response.status}).`);
  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) throw new Error("The generated creative did not return an image.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("The generated creative image is empty.");
  if (buffer.length > 6 * 1024 * 1024) throw new Error("The generated creative is larger than the 6 MB scheduling limit.");

  return {
    post,
    sourceMediaUrl,
    mediaBase64: buffer.toString("base64"),
    mediaMime: contentType.split(";")[0] || "image/png"
  };
}
