import { NextResponse } from "next/server";
import { CanvaApiError, canvaJson, type CanvaDesignSummary } from "@/lib/canva-api";

export async function GET(request:Request){
  try{
    const input=new URL(request.url).searchParams;
    const query=input.get("q")?.trim()||"";
    const continuation=input.get("continuation")?.trim()||"";
    const params=new URLSearchParams({limit:"24",ownership:"any",sort_by:query?"relevance":"modified_descending"});
    if(query)params.set("query",query.slice(0,255));
    if(continuation)params.set("continuation",continuation);

    const data=await canvaJson<{items?:CanvaDesignSummary[];continuation?:string}>(`/designs?${params.toString()}`);
    return NextResponse.json({
      items:(Array.isArray(data.items)?data.items:[]).map(item=>({
        ...item,
        open_url:`/api/admin/canva/designs/${encodeURIComponent(item.id)}/open`
      })),
      continuation:data.continuation||null
    });
  }catch(error){
    const status=error instanceof CanvaApiError?error.status:400;
    const code=error instanceof CanvaApiError?error.code:null;
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to load Canva designs.",code},{status});
  }
}
