import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type FacebookConnection = {
  pageId: string;
  pageName: string;
  graphVersion: string;
  connectedAt: string;
  source: "oauth" | "environment";
};

type StoredConnection = FacebookConnection & { accessToken: string };

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;
let memory: StoredConnection | null = null;

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  sql ??= neon(url);
  return sql;
}

async function ensureTable(db: NeonQueryFunction<false, false>) {
  initialized ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS medminds_facebook_connection (
      connection_key TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      page_name TEXT NOT NULL,
      token_cipher TEXT NOT NULL,
      graph_version TEXT NOT NULL,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  })();
  await initialized;
}

function tokenSecret() {
  const value = process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY?.trim() || process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error("Facebook token encryption requires SESSION_SECRET or FACEBOOK_TOKEN_ENCRYPTION_KEY.");
  return createHash("sha256").update(value).digest();
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value: string) {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("Stored Facebook token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", tokenSecret(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}

export function getFacebookConfig() {
  const appId = process.env.META_FACEBOOK_APP_ID?.trim() || process.env.FACEBOOK_APP_ID?.trim() || "";
  const appSecret = process.env.META_FACEBOOK_APP_SECRET?.trim() || process.env.FACEBOOK_APP_SECRET?.trim() || process.env.WHATSAPP_APP_SECRET?.trim() || "";
  const graphVersion = process.env.META_FACEBOOK_GRAPH_VERSION?.trim() || process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v25.0";
  const targetPageName = process.env.META_FACEBOOK_TARGET_PAGE_NAME?.trim() || "MedMinds Learning Centre";
  const staticPageId = process.env.MEDMINDS_FACEBOOK_PAGE_ID?.trim() || "";
  const staticAccessToken = process.env.MEDMINDS_FACEBOOK_PAGE_ACCESS_TOKEN?.trim() || "";
  return {
    appId,
    appSecret,
    graphVersion,
    targetPageName,
    oauthConfigured: Boolean(appId && appSecret),
    staticPageId,
    staticAccessToken,
    staticConfigured: Boolean(staticPageId && staticAccessToken)
  };
}

export function publicOrigin(request: Request) {
  const configured = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

export async function saveFacebookConnection(input: { pageId: string; pageName: string; accessToken: string; graphVersion: string }) {
  const connectedAt = new Date().toISOString();
  const item: StoredConnection = {
    pageId: input.pageId.trim(),
    pageName: input.pageName.trim(),
    accessToken: input.accessToken.trim(),
    graphVersion: input.graphVersion.trim(),
    connectedAt,
    source: "oauth"
  };
  const db = database();
  if (!db) {
    memory = item;
    return item;
  }
  await ensureTable(db);
  await db.query(`INSERT INTO medminds_facebook_connection (connection_key,page_id,page_name,token_cipher,graph_version,connected_at,updated_at)
    VALUES ('primary',$1,$2,$3,$4,NOW(),NOW())
    ON CONFLICT (connection_key) DO UPDATE SET page_id=EXCLUDED.page_id,page_name=EXCLUDED.page_name,
      token_cipher=EXCLUDED.token_cipher,graph_version=EXCLUDED.graph_version,connected_at=NOW(),updated_at=NOW()`,
  [item.pageId, item.pageName, encryptToken(item.accessToken), item.graphVersion]);
  return item;
}

export async function getFacebookConnectionSecret(): Promise<StoredConnection | null> {
  const config = getFacebookConfig();
  if (config.staticConfigured) {
    return {
      pageId: config.staticPageId,
      pageName: config.targetPageName,
      accessToken: config.staticAccessToken,
      graphVersion: config.graphVersion,
      connectedAt: "environment",
      source: "environment"
    };
  }
  const db = database();
  if (!db) return memory;
  await ensureTable(db);
  const rows = await db.query(`SELECT page_id,page_name,token_cipher,graph_version,connected_at FROM medminds_facebook_connection WHERE connection_key='primary' LIMIT 1`);
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    pageId: String(row.page_id),
    pageName: String(row.page_name),
    accessToken: decryptToken(String(row.token_cipher)),
    graphVersion: String(row.graph_version || config.graphVersion),
    connectedAt: new Date(String(row.connected_at)).toISOString(),
    source: "oauth"
  };
}

export async function getFacebookConnectionStatus() {
  const config = getFacebookConfig();
  const connection = await getFacebookConnectionSecret().catch(() => null);
  return {
    configured: config.oauthConfigured || config.staticConfigured,
    oauthConfigured: config.oauthConfigured,
    connected: Boolean(connection),
    targetPageName: config.targetPageName,
    pageId: connection?.pageId || null,
    pageName: connection?.pageName || null,
    graphVersion: connection?.graphVersion || config.graphVersion,
    connectedAt: connection?.connectedAt || null,
    source: connection?.source || null
  };
}

export async function deleteFacebookConnection() {
  memory = null;
  const db = database();
  if (!db) return true;
  await ensureTable(db);
  await db.query(`DELETE FROM medminds_facebook_connection WHERE connection_key='primary'`);
  return true;
}

function stateSecret() {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error("SESSION_SECRET is required for Facebook OAuth.");
  return value;
}

export function createFacebookOAuthState(returnTo = "/admin/facebook") {
  const safeReturnTo = returnTo.startsWith("/admin/") || returnTo === "/admin" ? returnTo : "/admin/facebook";
  const payload = Buffer.from(JSON.stringify({ returnTo: safeReturnTo, ts: Date.now(), nonce: randomBytes(12).toString("hex") })).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyFacebookOAuthState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Invalid Facebook OAuth state.");
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Invalid Facebook OAuth state.");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { returnTo?: string; ts?: number };
  if (!decoded.ts || Date.now() - decoded.ts > 15 * 60 * 1000) throw new Error("Facebook OAuth request expired. Please connect again.");
  const returnTo = decoded.returnTo && (decoded.returnTo.startsWith("/admin/") || decoded.returnTo === "/admin") ? decoded.returnTo : "/admin/facebook";
  return { returnTo };
}
