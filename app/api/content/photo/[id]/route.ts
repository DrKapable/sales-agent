import { getContentPhoto } from "@/lib/content-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const photo = await getContentPhoto(id);
  if (!photo) return new Response("Photo not found", { status: 404 });
  const bytes = Buffer.from(photo.base64, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": photo.mimeType || "image/png",
      "Cache-Control": "private, max-age=31536000, immutable"
    }
  });
}
