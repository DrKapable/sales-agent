import { createHmac, timingSafeEqual } from "node:crypto";
import { clientAttachmentChatContent, type ClientAttachmentKind } from "@/lib/client-attachment-content";
import { normalizeWhatsAppReply } from "@/lib/whatsapp-format";

export function verifyWhatsAppSignature(rawBody: string, signature: string | null, secret = process.env.WHATSAPP_APP_SECRET) {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const supplied = signature.slice(7);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

export type IncomingWhatsAppMessage = {
  id: string;
  phone: string;
  name: string | null;
  text: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
};

export type WhatsAppDeliveryReceipt = {
  id: string;
  status: string;
  timestamp: string | null;
  recipientId: string | null;
  error: string | null;
};

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

const extensionByMime: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/3gpp": "3gp"
};

function mediaFilename(kind: ClientAttachmentKind, mediaId: string, supplied: string | undefined, mimeType: string | undefined) {
  const clean = supplied?.replaceAll("\\", "/").split("/").pop()?.trim().slice(0, 220);
  if (clean) return clean;
  const extension = mimeType ? extensionByMime[mimeType.toLowerCase()] : undefined;
  return `${kind}-${mediaId.slice(-8)}${extension ? `.${extension}` : ""}`;
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
      const value = (change as {
        value?: {
          messages?: unknown[];
          contacts?: Array<{ profile?: { name?: string } }>;
          metadata?: { phone_number_id?: string; display_phone_number?: string };
        };
      })?.value;
      if (!Array.isArray(value?.messages)) continue;
      const phoneNumberId = value.metadata?.phone_number_id ?? null;
      const displayPhoneNumber = value.metadata?.display_phone_number ?? null;
      for (const message of value.messages) {
        const item = message as {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          document?: { id?: string; filename?: string; mime_type?: string; caption?: string };
          image?: { id?: string; mime_type?: string; caption?: string };
          audio?: { id?: string; mime_type?: string };
          video?: { id?: string; mime_type?: string; caption?: string };
        };
        if (!item.id || !item.from) continue;

        let text: string | null = null;
        if (item.type === "text" && item.text?.body) {
          text = item.text.body.trim().slice(0, 4000);
        } else if (["document", "image", "audio", "video"].includes(item.type || "")) {
          const kind = item.type as ClientAttachmentKind;
          const media = kind === "document" ? item.document : kind === "image" ? item.image : kind === "audio" ? item.audio : item.video;
          if (!media?.id) continue;
          const mimeType = media.mime_type?.trim().slice(0, 160) || null;
          const caption = "caption" in media && typeof media.caption === "string" ? media.caption.trim().slice(0, 1000) || null : null;
          text = clientAttachmentChatContent({
            kind,
            mediaId: media.id,
            fileName: mediaFilename(kind, media.id, kind === "document" ? item.document?.filename : undefined, mimeType || undefined),
            mimeType,
            caption
          });
        }
        if (!text) continue;

        parsed.push({
          id: item.id,
          phone: item.from,
          name: value.contacts?.[0]?.profile?.name ?? null,
          text,
          phoneNumberId,
          displayPhoneNumber
        });
      }
    }
  }
  return parsed;
}

export function parseDeliveryReceipts(payload: unknown): WhatsAppDeliveryReceipt[] {
  if (!payload || typeof payload !== "object") return [];
  const entries = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entries)) return [];
  const receipts: WhatsAppDeliveryReceipt[] = [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: { statuses?: unknown[] } })?.value;
      if (!Array.isArray(value?.statuses)) continue;
      for (const status of value.statuses) {
        const item = status as {
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          errors?: Array<{ title?: string; message?: string; error_data?: { details?: string } }>;
        };
        if (!item.id || !item.status) continue;
        const firstError = item.errors?.[0];
        const error = firstError
          ? [firstError.title, firstError.message, firstError.error_data?.details].filter(Boolean).join(": ").slice(0, 1000)
          : null;
        receipts.push({
          id: item.id,
          status: item.status,
          timestamp: item.timestamp ?? null,
          recipientId: item.recipient_id ?? null,
          error
        });
      }
    }
  }
  return receipts;
}

function whatsappConfig(phoneNumberIdOverride?: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = phoneNumberIdOverride || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  if (!token || !phoneNumberId || !version) throw new Error("WhatsApp sending is not configured.");
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phoneNumberId)) throw new Error("Invalid WhatsApp Graph configuration.");
  return { token, phoneNumberId, version };
}

export async function sendWhatsAppTypingIndicator(messageId: string, phoneNumberIdOverride?: string) {
  if (process.env.WHATSAPP_TYPING_INDICATOR === "false") return { success: false, skipped: true } as const;
  const { token, phoneNumberId, version } = whatsappConfig(phoneNumberIdOverride);
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" }
    })
  });
  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp typing indicator returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(rawBody))}`);
  }
  const parsed = rawBody ? JSON.parse(rawBody) as { success?: boolean } : { success: true };
  return { success: parsed.success !== false, skipped: false } as const;
}

export async function sendWhatsAppText(phone: string, body: string, phoneNumberIdOverride?: string) {
  const { token, phoneNumberId, version } = whatsappConfig(phoneNumberIdOverride);
  const formattedBody = normalizeWhatsAppReply(body);
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "text", text: { preview_url: false, body: formattedBody } })
  });
  const rawBody = await response.text();
  if (!response.ok) {
    const metaError = sanitizeWhatsAppApiError(rawBody);
    throw new Error(`WhatsApp API returned ${response.status}: ${JSON.stringify(metaError)}`);
  }
  const parsed = JSON.parse(rawBody) as { contacts?: Array<{ wa_id?: string }>; messages?: Array<{ id?: string }> };
  const messageId = parsed.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp API accepted the request without returning a message ID.");
  return { messageId, waId: parsed.contacts?.[0]?.wa_id ?? null };
}

export async function sendWhatsAppPdfDocument(input: {
  phone: string;
  pdf: Uint8Array;
  filename: string;
  caption?: string;
  phoneNumberIdOverride?: string;
}) {
  const { token, phoneNumberId, version } = whatsappConfig(input.phoneNumberIdOverride);
  const form = new FormData();
  const pdfBytes = input.pdf.buffer.slice(input.pdf.byteOffset, input.pdf.byteOffset + input.pdf.byteLength) as ArrayBuffer;
  form.set("messaging_product", "whatsapp");
  form.set("type", "application/pdf");
  form.set("file", new Blob([pdfBytes], { type: "application/pdf" }), input.filename);

  const upload = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/media`, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const uploadBody = await upload.text();
  if (!upload.ok) throw new Error(`WhatsApp media upload returned ${upload.status}: ${JSON.stringify(sanitizeWhatsAppApiError(uploadBody))}`);
  const mediaId = (JSON.parse(uploadBody) as { id?: string }).id;
  if (!mediaId) throw new Error("WhatsApp media upload succeeded without returning a media ID.");

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.phone,
      type: "document",
      document: {
        id: mediaId,
        filename: input.filename,
        ...(input.caption ? { caption: normalizeWhatsAppReply(input.caption).slice(0, 1024) } : {})
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
