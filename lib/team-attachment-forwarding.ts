import { fetchWhatsAppMedia } from "@/lib/whatsapp-media";
import { sanitizeWhatsAppApiError } from "@/lib/whatsapp";
import type { ClientAttachmentPayload } from "@/lib/client-attachment-content";
import type { TeamCopyRecipient } from "@/lib/team-notifications";

function config(phoneNumberIdOverride?: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  const phoneNumberId = phoneNumberIdOverride || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !version || !phoneNumberId) throw new Error("WhatsApp media forwarding is not configured.");
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phoneNumberId)) throw new Error("Invalid WhatsApp media forwarding configuration.");
  return { token, version, phoneNumberId };
}

function safeFilename(value: string | null, kind: string, mediaId: string) {
  const fallback = `${kind}-${mediaId.slice(-8)}`;
  const leaf = (value || fallback).replaceAll("\\", "/").split("/").pop() || fallback;
  return leaf.replace(/[\r\n"\\]+/g, "_").trim().slice(0, 180) || fallback;
}

async function uploadMedia(input: {
  attachment: ClientAttachmentPayload;
  phoneNumberIdOverride?: string;
}) {
  const { token, version, phoneNumberId } = config(input.phoneNumberIdOverride);
  const { response, info } = await fetchWhatsAppMedia(input.attachment.mediaId);
  const bytes = await response.arrayBuffer();
  const mimeType = input.attachment.mimeType || info.mimeType || "application/octet-stream";
  const filename = safeFilename(input.attachment.fileName, input.attachment.kind, input.attachment.mediaId);

  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mimeType);
  form.set("file", new Blob([bytes], { type: mimeType }), filename);

  const upload = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/media`, {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const raw = await upload.text();
  if (!upload.ok) throw new Error(`WhatsApp team media upload returned ${upload.status}: ${JSON.stringify(sanitizeWhatsAppApiError(raw))}`);
  const mediaId = (JSON.parse(raw) as { id?: string }).id;
  if (!mediaId) throw new Error("WhatsApp team media upload succeeded without returning a media ID.");
  return { mediaId, filename, mimeType, token, version, phoneNumberId };
}

async function sendUploadedMedia(input: {
  phone: string;
  kind: "image" | "document";
  mediaId: string;
  filename: string;
  caption: string;
  token: string;
  version: string;
  phoneNumberId: string;
}) {
  const mediaPayload = input.kind === "document"
    ? { id: input.mediaId, filename: input.filename, caption: input.caption.slice(0, 1024) }
    : { id: input.mediaId, caption: input.caption.slice(0, 1024) };

  const response = await fetch(`https://graph.facebook.com/${input.version}/${input.phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.phone.replace(/\D/g, ""),
      type: input.kind,
      [input.kind]: mediaPayload
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`WhatsApp team media send returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(raw))}`);
  return (JSON.parse(raw) as { messages?: Array<{ id?: string }> }).messages?.[0]?.id || null;
}

export async function forwardAttachmentToReviewers(input: {
  attachment: ClientAttachmentPayload;
  recipients: TeamCopyRecipient[];
  caption: string;
  phoneNumberIdOverride?: string;
}) {
  if (!["image", "document"].includes(input.attachment.kind)) return [];
  const uploaded = await uploadMedia({ attachment: input.attachment, phoneNumberIdOverride: input.phoneNumberIdOverride });
  const seen = new Set<string>();
  const recipients = input.recipients.filter((recipient) => {
    const key = recipient.phone?.replace(/\D/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return Promise.allSettled(recipients.map(async (recipient) => {
    if (!recipient.phone) return { recipient: recipient.name, sent: false, messageId: null };
    const messageId = await sendUploadedMedia({
      phone: recipient.phone,
      kind: input.attachment.kind as "image" | "document",
      mediaId: uploaded.mediaId,
      filename: uploaded.filename,
      caption: input.caption,
      token: uploaded.token,
      version: uploaded.version,
      phoneNumberId: uploaded.phoneNumberId
    });
    return { recipient: recipient.name, sent: true, messageId };
  }));
}
