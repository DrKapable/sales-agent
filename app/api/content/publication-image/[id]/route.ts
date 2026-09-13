import { getPublicationAsset } from "@/lib/content-publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const asset = await getPublicationAsset(id);
  if (!asset) return new Response("Publication image not found", { status: 404 });
  return new Response(Buffer.from(asset.base64, "base64"), {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType || "image/png",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
