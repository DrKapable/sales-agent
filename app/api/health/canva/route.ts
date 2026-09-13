import { NextResponse } from "next/server";
import { canvaPublicOrigin, getCanvaConfig, getCanvaConnectionStatus } from "@/lib/canva-connection";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = getCanvaConfig();
  const origin = canvaPublicOrigin(request);
  const status = await getCanvaConnectionStatus();

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
    scopes: config.scopes,
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
