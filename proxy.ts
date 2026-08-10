import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/session";

function contentSecurityPolicy(nonce: string) {
  const connectSource = process.env.NODE_ENV === "development" ? "connect-src 'self' ws: http:" : "connect-src 'self'";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    connectSource,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");
}

function applyContentSecurityPolicy(response: NextResponse, policy: string) {
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const isProtected = path.startsWith("/admin") || path.startsWith("/api/admin");
  const isLogin = path === "/admin/login" || path === "/api/admin/login";

  if (isProtected && !isLogin && !verifySessionToken(request.cookies.get(sessionCookieName)?.value)) {
    if (path.startsWith("/api/")) return applyContentSecurityPolicy(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), policy);
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", path);
    return applyContentSecurityPolicy(NextResponse.redirect(login), policy);
  }

  return applyContentSecurityPolicy(NextResponse.next({ request: { headers: requestHeaders } }), policy);
}

export const config = { matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }] };
