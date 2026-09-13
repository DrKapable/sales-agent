import { NextResponse } from "next/server";
import { getCanvaConfig, validateCanvaCredentials } from "@/lib/canva-connection";

export const dynamic = "force-dynamic";

export async function GET(){
  const config=getCanvaConfig();
  const result=await validateCanvaCredentials();
  return NextResponse.json({
    configured:config.oauthConfigured,
    valid:result.valid,
    code:result.code,
    message:result.message,
  },{headers:{"Cache-Control":"no-store, max-age=0","X-Robots-Tag":"noindex, nofollow"}});
}
