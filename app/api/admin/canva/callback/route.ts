import { NextResponse } from "next/server";
import { canvaPublicOrigin, getCanvaConfig, saveCanvaConnection, verifyCanvaOAuthState } from "@/lib/canva-connection";

export async function GET(request:Request){
  const origin=canvaPublicOrigin(request);
  try{
    const url=new URL(request.url);
    const code=url.searchParams.get("code")||"";
    const state=url.searchParams.get("state")||"";
    const oauthError=url.searchParams.get("error");
    const {returnTo}=verifyCanvaOAuthState(state);
    if(oauthError||!code)return NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?")?"&":"?"}canva=connection-failed`,origin));
    const verifier=request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith("medminds_canva_pkce="))?.split("=").slice(1).join("=")||"";
    if(!verifier)throw new Error("Canva PKCE verifier is missing. Please reconnect Canva.");
    const config=getCanvaConfig();
    if(!config.oauthConfigured)throw new Error("Canva OAuth is not configured.");
    const redirectUri=`${origin}/api/admin/canva/callback`;
    const response=await fetch("https://api.canva.com/rest/v1/oauth/token",{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:redirectUri,code_verifier:decodeURIComponent(verifier)}),cache:"no-store"});
    const data=await response.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;message?:string};
    if(!response.ok||!data.access_token||!data.refresh_token)throw new Error(data.message||"Canva authorization could not be completed.");
    await saveCanvaConnection({accessToken:data.access_token,refreshToken:data.refresh_token,expiresIn:Number(data.expires_in||14400)});
    const redirect=NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?")?"&":"?"}canva=connected`,origin));
    redirect.cookies.set("medminds_canva_pkce","",{httpOnly:true,secure:true,sameSite:"lax",maxAge:0,path:"/api/admin/canva"});
    return redirect;
  }catch{
    return NextResponse.redirect(new URL("/admin/content?canva=connection-failed",origin));
  }
}
