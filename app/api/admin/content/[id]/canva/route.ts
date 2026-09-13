import { NextResponse } from "next/server";
import { getContentPost } from "@/lib/content-studio";
import { getCanvaConnectionStatus } from "@/lib/canva-connection";
import { getCanvaContentDesign, getCanvaContentExport } from "@/lib/canva-content-designs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = await getContentPost(id);
  if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });
  const [canva, design, imported] = await Promise.all([
    getCanvaConnectionStatus(),
    getCanvaContentDesign(id),
    getCanvaContentExport(id)
  ]);
  return NextResponse.json({
    post,
    canva,
    design,
    imported: imported ? {
      designId: imported.designId,
      creativeVersion: imported.creativeVersion,
      importedAt: imported.importedAt,
      isCurrent: imported.creativeVersion === post.creativeVersion
    } : null,
    previewUrl: `/api/content/creative/${id}?v=${post.creativeVersion || 1}`
  });
}
