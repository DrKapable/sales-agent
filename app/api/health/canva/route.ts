import { NextResponse } from "next/server";
import { canvaPublicOrigin, getCanvaConfig, getCanvaConnectionStatus } from "@/lib/canva-connection";

export const dynamic = "force-dynamic";

async function probeClientCredentials(clientId: string, clientSecret: string) {
  if (!clientId || !clientSecret) return { attempted: false, validPair: false, status: null, code: "not_configured", message: "Canva credentials are not configured." };

  try {
    const response = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "medminds-canva-credential-probe-invalid-token",
      }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({})) as { code?: string; message?: string };
    const code = data.code || "unknown";
    return {
      attempted: true,
      validPair: response.status === 400 && code === "invalid_grant",
      status: response.status,
      code,
      message: data.message || null,
    };
  } catch (error) {
    return {
      attempted: true,
      validPair: false,
      status: null,
      code: "network_error",
      message: error instanceof Error ? error.message : "Unable to reach Canva OAuth token endpoint.",
    };
  }
}

export async function GET(request: Request) {
  const config = getCanvaConfig();
  const origin = canvaPublicOrigin(request);
  const status = await getCanvaConnectionStatus();
  const credentialProbe = await probeClientCredentials(config.clientId, config.clientSecret);

  return NextResponse.json({
    ok: true,
    configured: status.configured,
    connected: status.connected,
    connectedAt: status.connectedAt,
    expiresAt: status.expiresAt,
    publicOrigin: origin,
    redirectUri: `${origin}/api/admin/canva/callback`,
    databaseConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    sessionSecretConfigured: Boolean(process.env.SESSION_SECRET?.trim()),
    tokenEncryptionKeyConfigured: Boolean(process.env.CANVA_TOKEN_ENCRYPTION_KEY?.trim()),
    clientIdConfigured: Boolean(config.clientId),
    clientSecretConfigured: Boolean(config.clientSecret),
    credentialProbe,
    scopes: config.scopes,
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
