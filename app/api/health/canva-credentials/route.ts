import { NextResponse } from "next/server";
import { getCanvaConfig, validateCanvaCredentials } from "@/lib/canva-connection";

export const dynamic = "force-dynamic";

export async function GET(){
  const config=getCanvaConfig();
  const result=await validateCanvaCredentials();
  const status=result.valid===true?200:result.valid===false?401:503;
  return NextResponse.json({
    configured:config.oauthConfigured,
    valid:result.valid,
    code:result.code,
    message:result.message,
  },{status,headers:{"Cache-Control":"no-store, max-age=0","X-Robots-Tag":"noindex, nofollow"}});
}
