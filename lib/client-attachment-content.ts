export type ClientAttachmentKind = "document" | "image" | "audio" | "video";

export type ClientAttachmentPayload = {
  kind: ClientAttachmentKind;
  mediaId: string;
  fileName: string | null;
  mimeType: string | null;
  caption: string | null;
};

export const CLIENT_ATTACHMENT_PREFIX = "[CLIENT_ATTACHMENT] ";

function clean(value: string | null | undefined, max: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function clientAttachmentChatContent(input: ClientAttachmentPayload) {
  const payload: ClientAttachmentPayload = {
    kind: input.kind,
    mediaId: input.mediaId.trim().slice(0, 160),
    fileName: clean(input.fileName, 220),
    mimeType: clean(input.mimeType, 160),
    caption: clean(input.caption, 1000)
  };
  return `${CLIENT_ATTACHMENT_PREFIX}${JSON.stringify(payload)}`;
}

export function parseClientAttachmentChatContent(content: string): ClientAttachmentPayload | null {
  const prefix = content.match(/^\s*\[CLIENT_ATTACHMENT\]\s*/);
  if (!prefix) return null;
  try {
    // Admin delivery markers are presentation metadata, never part of the payload.
    const payload = content.slice(prefix[0].length).replace(/(?:\u2063[\u200B\u200C\u200D\u2060\uFEFF]\u2063\s*)+$/, "").trim();
    const parsed = JSON.parse(payload) as Partial<ClientAttachmentPayload>;
    if (!parsed || !["document", "image", "audio", "video"].includes(String(parsed.kind)) || typeof parsed.mediaId !== "string" || !/^[A-Za-z0-9_-]{5,160}$/.test(parsed.mediaId.trim())) return null;
    return {
      kind: parsed.kind as ClientAttachmentKind,
      mediaId: parsed.mediaId.trim().slice(0, 160),
      fileName: clean(typeof parsed.fileName === "string" ? parsed.fileName : null, 220),
      mimeType: clean(typeof parsed.mimeType === "string" ? parsed.mimeType : null, 160),
      caption: clean(typeof parsed.caption === "string" ? parsed.caption : null, 1000)
    };
  } catch {
    return null;
  }
}

export function clientAttachmentUrl(attachment: ClientAttachmentPayload, download = false, attempt = 0) {
  const params = new URLSearchParams({ filename: attachmentDisplayName(attachment) });
  if (download) params.set("download", "1");
  if (attempt) params.set("retry", String(attempt));
  return `/api/admin/whatsapp-media/${encodeURIComponent(attachment.mediaId)}?${params.toString()}`;
}

export function attachmentDisplayName(attachment: ClientAttachmentPayload) {
  if (attachment.fileName) return attachment.fileName;
  const extension = attachment.mimeType?.split("/")[1]?.split(/[;+]/)[0]?.replace(/[^a-z0-9]+/gi, "") || "file";
  return `${attachment.kind}-${attachment.mediaId.slice(-8)}.${extension}`;
}
