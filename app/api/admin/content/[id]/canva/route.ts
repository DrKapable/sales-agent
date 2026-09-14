import { NextResponse } from "next/server";
import { getContentPost } from "@/lib/content-studio";
import { CanvaApiError, canvaJson, getCanvaDesign } from "@/lib/canva-api";
import { getCanvaConnectionStatus } from "@/lib/canva-connection";
import { getCanvaContentDesign, getCanvaContentExport } from "@/lib/canva-content-designs";

type ExportFormats=Record<string,{page_numbers?:number[]}>;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = await getContentPost(id);
  if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });
  const [canva, linked, imported] = await Promise.all([
    getCanvaConnectionStatus(),
    getCanvaContentDesign(id),
    getCanvaContentExport(id)
  ]);

  let design=linked?{
    postId:linked.postId,
    designId:linked.designId,
    updatedAt:linked.updatedAt,
    openUrl:`/api/admin/canva/designs/${encodeURIComponent(linked.designId)}/open?returnTo=${encodeURIComponent(`/admin/content/${id}/canva`)}`,
    accessible:null as boolean|null,
    title:null as string|null,
    thumbnail:null as {width?:number;height?:number;url?:string}|null,
    pageCount:null as number|null,
    designTypes:[] as string[],
    exportFormats:{} as ExportFormats,
    error:null as string|null,
    errorCode:null as string|null
  }:null;

  if(canva.connected&&linked){
    try{
      const [live,formatResult]=await Promise.all([
        getCanvaDesign(linked.designId),
        canvaJson<{formats?:ExportFormats}>(`/designs/${encodeURIComponent(linked.designId)}/export-formats`)
      ]);
      design={
        ...design!,
        accessible:true,
        title:live.title||null,
        thumbnail:live.thumbnail||null,
        pageCount:live.page_count||null,
        designTypes:live.design_types||[],
        exportFormats:formatResult.formats||{},
        error:null,
        errorCode:null
      };
    }catch(error){
      design={...design!,accessible:false,error:error instanceof Error?error.message:"Unable to access the linked Canva design.",errorCode:error instanceof CanvaApiError?error.code:null};
    }
  }

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
