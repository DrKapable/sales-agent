import { NextResponse } from "next/server";
import { CanvaApiError, canvaJson } from "@/lib/canva-api";
import { getCanvaConnectionStatus, getCanvaConfig } from "@/lib/canva-connection";

export async function GET(){
  const status=await getCanvaConnectionStatus();
  const config=getCanvaConfig();
  if(!status.configured)return NextResponse.json({...status,apiReachable:false,capabilities:[],scopes:config.scopes,error:"Canva OAuth credentials are not configured."},{status:503});
  if(!status.connected)return NextResponse.json({...status,apiReachable:false,capabilities:[],scopes:config.scopes,error:"Canva is not connected."},{status:409});
  try{
    const [user,capabilityResult]=await Promise.all([
      canvaJson<{team_user?:{user_id?:string;team_id?:string}}>("/users/me"),
      canvaJson<{capabilities?:string[]}>("/users/me/capabilities")
    ]);
    return NextResponse.json({
      ...status,
      apiReachable:true,
      teamUser:user.team_user||null,
      capabilities:Array.isArray(capabilityResult.capabilities)?capabilityResult.capabilities:[],
      scopes:config.scopes
    });
  }catch(error){
    const statusCode=error instanceof CanvaApiError?error.status:502;
    return NextResponse.json({
      ...status,
      apiReachable:false,
      capabilities:[],
      scopes:config.scopes,
      code:error instanceof CanvaApiError?error.code:null,
      error:error instanceof Error?error.message:"Unable to verify Canva connectivity."
    },{status:statusCode});
  }
}
