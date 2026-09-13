import { NextResponse } from "next/server";
import { createFacebookOAuthState, getFacebookConfig, publicOrigin } from "@/lib/facebook-connection";

export async function GET(request: Request) {
  const config = getFacebookConfig();
  if (!config.oauthConfigured) {
    return NextResponse.redirect(new URL("/admin/facebook?facebook=setup-required", publicOrigin(request)));
  }

  const redirectUri = `${publicOrigin(request)}/api/admin/facebook/callback`;
  const oauth = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  oauth.searchParams.set("client_id", config.appId);
  oauth.searchParams.set("redirect_uri", redirectUri);
  oauth.searchParams.set("state", createFacebookOAuthState("/admin/facebook"));
  oauth.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_manage_posts");
  oauth.searchParams.set("response_type", "code");
  return NextResponse.redirect(oauth);
}
