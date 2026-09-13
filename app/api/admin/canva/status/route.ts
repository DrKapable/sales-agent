import { NextResponse } from "next/server";
import { getCanvaConnectionStatus, getCanvaConfig } from "@/lib/canva-connection";

export async function GET(){
  const status=await getCanvaConnectionStatus();
  const config=getCanvaConfig();
  return NextResponse.json({...status,scopes:config.scopes});
}
