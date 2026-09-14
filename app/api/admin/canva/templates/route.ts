import { NextResponse } from "next/server";
import { CanvaApiError, canvaJson } from "@/lib/canva-api";

type BrandTemplate={
  id:string;
  title:string;
  create_url?:string;
  view_url?:string;
  created_at?:number;
  updated_at?:number;
  thumbnail?:{width?:number;height?:number;url?:string};
};

export async function GET(request:Request){
  try{
    const input=new URL(request.url).searchParams;
    const query=input.get("q")?.trim()||"";
    const continuation=input.get("continuation")?.trim()||"";
    const params=new URLSearchParams();
    if(query)params.set("query",query.slice(0,255));
    if(continuation)params.set("continuation",continuation);
    const suffix=params.size?`?${params.toString()}`:"";
    const data=await canvaJson<{items?:BrandTemplate[];continuation?:string}>(`/brand-templates${suffix}`);
    return NextResponse.json({items:Array.isArray(data.items)?data.items:[],continuation:data.continuation||null});
  }catch(error){
    const status=error instanceof CanvaApiError?error.status:400;
    const code=error instanceof CanvaApiError?error.code:null;
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to load Canva templates.",code},{status});
  }
}
