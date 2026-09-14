import { NextResponse } from "next/server";
import { getCanvaConnectionSecret } from "@/lib/canva-connection";

export async function GET(request:Request){
  try{
    const connection=await getCanvaConnectionSecret();
    if(!connection)return NextResponse.json({error:"Connect Canva before loading designs."},{status:409});

    const input=new URL(request.url).searchParams;
    const query=input.get("q")?.trim()||"";
    const continuation=input.get("continuation")?.trim()||"";
    const url=new URL("https://api.canva.com/rest/v1/designs");
    url.searchParams.set("limit","24");
    url.searchParams.set("ownership","any");
    url.searchParams.set("sort_by",query?"relevance":"modified_descending");
    if(query)url.searchParams.set("query",query.slice(0,255));
    if(continuation)url.searchParams.set("continuation",continuation);

    const response=await fetch(url,{headers:{Authorization:`Bearer ${connection.accessToken}`},cache:"no-store"});
    const data=await response.json().catch(()=>({})) as {items?:unknown[];continuation?:string;message?:string;code?:string};
    if(!response.ok)return NextResponse.json({error:data.message||"Unable to load Canva designs.",code:data.code||null},{status:response.status});
    return NextResponse.json({items:Array.isArray(data.items)?data.items:[],continuation:data.continuation||null});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to load Canva designs."},{status:400});
  }
}
