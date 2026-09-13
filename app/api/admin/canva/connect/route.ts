import { NextResponse } from "next/server";
import { createCanvaOAuthState, createCanvaPkce, canvaPublicOrigin, getCanvaConfig, validateCanvaCredentials } from "@/lib/canva-connection";

export async function GET(request:Request){
  const config=getCanvaConfig();
  const url=new URL(request.url);
  const returnTo=url.searchParams.get("returnTo")||"/admin/content";
  const origin=canvaPublicOrigin(request);
  const resultUrl=(result:string)=>new URL(`${returnTo}${returnTo.includes("?")?"&":"?"}canva=${encodeURIComponent(result)}`,origin);

  if(!config.oauthConfigured)return NextResponse.redirect(resultUrl("setup-required"));

  const credentialCheck=await validateCanvaCredentials();
  if(credentialCheck.valid===false){
    console.error("[canva-oauth] configured client credentials were rejected by Canva",{code:credentialCheck.code,message:credentialCheck.message});
    return NextResponse.redirect(resultUrl("invalid-client"));
  }

  const {verifier,challenge}=createCanvaPkce();
  const state=createCanvaOAuthState(returnTo);
  const redirectUri=`${origin}/api/admin/canva/callback`;
  const auth=new URL("https://www.canva.com/api/oauth/authorize");
  auth.searchParams.set("code_challenge",challenge);
  auth.searchParams.set("code_challenge_method","s256");
  auth.searchParams.set("scope",config.scopes.join(" "));
  auth.searchParams.set("response_type","code");
  auth.searchParams.set("client_id",config.clientId);
  auth.searchParams.set("state",state);
  auth.searchParams.set("redirect_uri",redirectUri);
  const response=NextResponse.redirect(auth);
  response.cookies.set("medminds_canva_pkce",verifier,{httpOnly:true,secure:true,sameSite:"lax",maxAge:15*60,path:"/api/admin/canva"});
  return response;
}
