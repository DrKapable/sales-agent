import { NextResponse } from "next/server";
import { canvaPublicOrigin, getCanvaConfig, saveCanvaConnection, verifyCanvaOAuthState } from "@/lib/canva-connection";

function safeErrorCode(value:string|undefined|null){
  const cleaned=(value||"unknown_error").toLowerCase().replace(/[^a-z0-9_-]+/g,"_").slice(0,80);
  return cleaned||"unknown_error";
}

function resultUrl(origin:string,returnTo:string,result:string,errorCode?:string){
  const target=new URL(returnTo,origin);
  target.searchParams.set("canva",result);
  if(errorCode)target.searchParams.set("canva_error",safeErrorCode(errorCode));
  return target;
}

export async function GET(request:Request){
  const origin=canvaPublicOrigin(request);
  let returnTo="/admin/content";
  try{
    const url=new URL(request.url);
    const code=url.searchParams.get("code")||"";
    const state=url.searchParams.get("state")||"";
    const oauthError=url.searchParams.get("error");
    const oauthErrorDescription=url.searchParams.get("error_description");
    ({returnTo}=verifyCanvaOAuthState(state));

    if(oauthError||!code){
      console.error("[canva-oauth] authorization was not completed",{oauthError,oauthErrorDescription,hasCode:Boolean(code)});
      return NextResponse.redirect(resultUrl(origin,returnTo,"connection-failed",oauthError||"missing_code"));
    }

    const verifier=request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith("medminds_canva_pkce="))?.split("=").slice(1).join("=")||"";
    if(!verifier)throw Object.assign(new Error("Canva PKCE verifier is missing. Please reconnect Canva."),{code:"missing_pkce"});

    const config=getCanvaConfig();
    if(!config.oauthConfigured)throw Object.assign(new Error("Canva OAuth is not configured."),{code:"not_configured"});

    const redirectUri=`${origin}/api/admin/canva/callback`;
    const response=await fetch("https://api.canva.com/rest/v1/oauth/token",{
      method:"POST",
      headers:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:redirectUri,code_verifier:decodeURIComponent(verifier)}),
      cache:"no-store"
    });
    const data=await response.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;code?:string;message?:string};
    if(!response.ok||!data.access_token||!data.refresh_token){
      const error=Object.assign(new Error(data.message||`Canva authorization could not be completed (HTTP ${response.status}).`),{code:data.code||`http_${response.status}`});
      throw error;
    }

    await saveCanvaConnection({accessToken:data.access_token,refreshToken:data.refresh_token,expiresIn:Number(data.expires_in||14400)});
    const redirect=NextResponse.redirect(resultUrl(origin,returnTo,"connected"));
    redirect.cookies.set("medminds_canva_pkce","",{httpOnly:true,secure:true,sameSite:"lax",maxAge:0,path:"/api/admin/canva"});
    return redirect;
  }catch(error){
    const code=safeErrorCode(typeof error==="object"&&error&&"code" in error?String((error as {code?:unknown}).code||"callback_error"):"callback_error");
    console.error("[canva-oauth] callback failed",{code,message:error instanceof Error?error.message:"Unknown Canva callback error"});
    return NextResponse.redirect(resultUrl(origin,returnTo,"connection-failed",code));
  }
}
