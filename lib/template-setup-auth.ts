import { timingSafeEqual } from "node:crypto";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export function isAuthorizedTemplateSetup(request: Request, now = Date.now()) {
  if (isAuthorizedCronRequest(request)) return true;
  // Optional setup token is scoped to these two fixed templates and expires within an hour.
  const secret = process.env.WHATSAPP_TEMPLATE_SETUP_TOKEN?.trim();
  if (!secret) return false;
  const [expiry, random] = secret.split(".");
  const expiresAt = Number(expiry);
  if (!/^\d+$/.test(expiry) || !/^[a-f0-9]{64}$/.test(random || "") || expiresAt <= now || expiresAt > now + 60 * 60 * 1000) return false;
  const provided = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  return Buffer.byteLength(provided) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
