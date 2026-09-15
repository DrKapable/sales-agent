import { getContentMediaAsset } from "@/lib/content-media-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const asset = await getContentMediaAsset(id);
  if (!asset) return new Response("Media asset not found", { status: 404 });
  return new Response(Buffer.from(asset.base64, "base64"), {
    headers: {
      "Content-Type": asset.mimeType || "image/png",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Disposition": `inline; filename="${asset.fileName.replace(/\"/g, "")}"`
    }
  });
}
