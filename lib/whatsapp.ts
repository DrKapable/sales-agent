import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsAppSignature(rawBody: string, signature: string | null, secret = process.env.WHATSAPP_APP_SECRET) {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const supplied = signature.slice(7);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export type IncomingWhatsAppMessage = { id: string; phone: string; name: string | null; text: string };

const redactSensitiveMetaText = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  return value
    .slice(0, 1000)
    .replace(/(bearer\s+)[a-z0-9._~-]+/gi, "$1[REDACTED]")
    .replace(/\+?\d{8,15}/g, "[REDACTED_NUMBER]");
};

export function sanitizeWhatsAppApiError(rawBody: string) {
  try {
    const payload = JSON.parse(rawBody) as {
      error?: {
        code?: unknown;
        error_subcode?: unknown;
        type?: unknown;
        message?: unknown;
        error_data?: { details?: unknown };
        fbtrace_id?: unknown;
      };
    };
    const error = payload?.error;
    return {
      code: typeof error?.code === "number" ? error.code : undefined,
      subcode: typeof error?.error_subcode === "number" ? error.error_subcode : undefined,
      type: redactSensitiveMetaText(error?.type),
      message: redactSensitiveMetaText(error?.message),
      details: redactSensitiveMetaText(error?.error_data?.details),
      traceId: redactSensitiveMetaText(error?.fbtrace_id)
    };
  } catch {
    return { message: redactSensitiveMetaText(rawBody) || "Unparseable Meta error response" };
  }
}

export function parseIncomingMessages(payload: unknown): IncomingWhatsAppMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const entries = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entries)) return [];
  const parsed: IncomingWhatsAppMessage[] = [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[]; contacts?: Array<{ profile?: { name?: string } }> } })?.value;
      if (!Array.isArray(value?.messages)) continue;
      for (const message of value.messages) {
        const item = message as { id?: string; from?: string; type?: string; text?: { body?: string } };
        if (item.type !== "text" || !item.id || !item.from || !item.text?.body) continue;
        parsed.push({ id: item.id, phone: item.from, name: value.contacts?.[0]?.profile?.name ?? null, text: item.text.body.trim().slice(0, 4000) });
      }
    }
  }
  return parsed;
}

export async function sendWhatsAppText(phone: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  if (!token || !phoneNumberId || !version) throw new Error("WhatsApp sending is not configured.");
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phoneNumberId)) throw new Error("Invalid WhatsApp Graph configuration.");
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "text", text: { preview_url: false, body } })
  });
  if (!response.ok) {
    const metaError = sanitizeWhatsAppApiError(await response.text());
    throw new Error(`WhatsApp API returned ${response.status}: ${JSON.stringify(metaError)}`);
  }
}
