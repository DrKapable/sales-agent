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
  if (!content.startsWith(CLIENT_ATTACHMENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(content.slice(CLIENT_ATTACHMENT_PREFIX.length)) as Partial<ClientAttachmentPayload>;
    if (!parsed || !["document", "image", "audio", "video"].includes(String(parsed.kind)) || typeof parsed.mediaId !== "string" || !parsed.mediaId.trim()) return null;
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

export function attachmentDisplayName(attachment: ClientAttachmentPayload) {
  if (attachment.fileName) return attachment.fileName;
  const extension = attachment.mimeType?.split("/")[1]?.split(/[;+]/)[0]?.replace(/[^a-z0-9]+/gi, "") || "file";
  return `${attachment.kind}-${attachment.mediaId.slice(-8)}.${extension}`;
}
