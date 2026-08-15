import { normalizeWhatsAppReply } from "@/lib/whatsapp-format";
import { sanitizeWhatsAppApiError } from "@/lib/whatsapp";

function config(phoneNumberIdOverride?: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = phoneNumberIdOverride || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  if (!token || !phoneNumberId || !version) throw new Error("WhatsApp sending is not configured.");
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phoneNumberId)) throw new Error("Invalid WhatsApp Graph configuration.");
  return { token, phoneNumberId, version };
}

export async function sendClientWhatsAppDocument(input: {
  phone: string;
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  caption?: string | null;
  phoneNumberIdOverride?: string;
}) {
  const { token, phoneNumberId, version } = config(input.phoneNumberIdOverride);
  const form = new FormData();
  const arrayBuffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
  form.set("messaging_product", "whatsapp");
  form.set("type", input.mimeType);
  form.set("file", new Blob([arrayBuffer], { type: input.mimeType }), input.filename);

  const upload = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/media`, {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const uploadBody = await upload.text();
  if (!upload.ok) throw new Error(`WhatsApp media upload returned ${upload.status}: ${JSON.stringify(sanitizeWhatsAppApiError(uploadBody))}`);
  const mediaId = (JSON.parse(uploadBody) as { id?: string }).id;
  if (!mediaId) throw new Error("WhatsApp media upload succeeded without returning a media ID.");

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.phone,
      type: "document",
      document: {
        id: mediaId,
        filename: input.filename,
        ...(input.caption?.trim() ? { caption: normalizeWhatsAppReply(input.caption).slice(0, 1024) } : {})
      }
    })
  });
  const rawBody = await response.text();
  if (!response.ok) throw new Error(`WhatsApp document API returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(rawBody))}`);
  const parsed = JSON.parse(rawBody) as { messages?: Array<{ id?: string }> };
  const messageId = parsed.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp accepted the document without returning a message ID.");
  return { messageId, mediaId };
}
