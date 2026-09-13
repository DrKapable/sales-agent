import { NextResponse } from "next/server";
import { getCanvaConnectionSecret } from "@/lib/canva-connection";

export async function GET(request:Request){
  try{
    const connection=await getCanvaConnectionSecret();
    if(!connection)return NextResponse.json({error:"Connect Canva before loading templates."},{status:409});
    const query=new URL(request.url).searchParams.get("q")?.trim()||"";
    const url=new URL("https://api.canva.com/rest/v1/brand-templates");
    if(query)url.searchParams.set("query",query);
    const response=await fetch(url,{headers:{Authorization:`Bearer ${connection.accessToken}`},cache:"no-store"});
    const data=await response.json().catch(()=>({})) as {items?:unknown[];continuation?:string;message?:string};
    if(!response.ok)return NextResponse.json({error:data.message||"Unable to load Canva Brand Templates."},{status:response.status});
    return NextResponse.json({items:Array.isArray(data.items)?data.items:[],continuation:data.continuation||null});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load Canva templates."},{status:400});}
}
