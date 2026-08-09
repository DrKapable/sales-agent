import { createHmac, timingSafeEqual } from "node:crypto";

export const sessionCookieName = "medminds_admin";

function signature(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return "";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken() {
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ expires })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifySessionToken(token: string | undefined) {
  if (!token || !process.env.SESSION_SECRET) return false;
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return false;
  const expected = signature(payload);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { expires: number };
    return parsed.expires > Date.now();
  } catch { return false; }
}

