import { NextResponse } from "next/server";
import { getFacebookConfig, publicOrigin, saveFacebookConnection, verifyFacebookOAuthState } from "@/lib/facebook-connection";

type TokenResponse = { access_token?: string; token_type?: string; expires_in?: number; error?: { message?: string } };
type PageResult = { id?: string; name?: string; access_token?: string; tasks?: string[] };
type PagesResponse = { data?: PageResult[]; error?: { message?: string } };

function destination(request: Request, path: string, state: string) {
  const url = new URL(path, publicOrigin(request));
  url.searchParams.set("facebook", state);
  return url;
}

export async function GET(request: Request) {
  const config = getFacebookConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return NextResponse.redirect(destination(request, "/admin/social", "cancelled"));
  if (!code || !state || !config.oauthConfigured) return NextResponse.redirect(destination(request, "/admin/social", "invalid-callback"));

  let returnTo = "/admin/social";
  try {
    returnTo = verifyFacebookOAuthState(state).returnTo;
    const redirectUri = `${publicOrigin(request)}/api/admin/facebook/callback`;
    const tokenUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", config.appId);
    tokenUrl.searchParams.set("client_secret", config.appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const shortResponse = await fetch(tokenUrl, { cache: "no-store" });
    const shortData = await shortResponse.json().catch(() => ({})) as TokenResponse;
    if (!shortResponse.ok || !shortData.access_token) throw new Error(shortData.error?.message || "Facebook sign-in did not return an access token.");

    let userToken = shortData.access_token;
    const longUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", config.appId);
    longUrl.searchParams.set("client_secret", config.appSecret);
    longUrl.searchParams.set("fb_exchange_token", userToken);
    const longResponse = await fetch(longUrl, { cache: "no-store" });
    const longData = await longResponse.json().catch(() => ({})) as TokenResponse;
    if (longResponse.ok && longData.access_token) userToken = longData.access_token;

    const pagesUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/me/accounts`);
    pagesUrl.searchParams.set("fields", "id,name,access_token,tasks");
    pagesUrl.searchParams.set("limit", "100");
    pagesUrl.searchParams.set("access_token", userToken);
    const pagesResponse = await fetch(pagesUrl, { cache: "no-store" });
    const pagesData = await pagesResponse.json().catch(() => ({})) as PagesResponse;
    if (!pagesResponse.ok) throw new Error(pagesData.error?.message || "Unable to list Facebook Pages for this account.");

    const target = config.targetPageName.toLocaleLowerCase();
    const page = (pagesData.data || []).find((item) => item.name?.trim().toLocaleLowerCase() === target);
    if (!page?.id || !page.access_token || !page.name) {
      return NextResponse.redirect(destination(request, returnTo, "page-not-found"));
    }

    await saveFacebookConnection({ pageId: page.id, pageName: page.name, accessToken: page.access_token, graphVersion: config.graphVersion });
    return NextResponse.redirect(destination(request, returnTo, "connected"));
  } catch (error) {
    console.error("Facebook Page connection failed", error);
    return NextResponse.redirect(destination(request, returnTo, "connection-failed"));
  }
}
