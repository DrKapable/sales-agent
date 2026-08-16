"use client";

import { useEffect } from "react";
import { attachmentDisplayName, parseClientAttachmentChatContent } from "@/lib/client-attachment-content";

function attachmentUrl(mediaId: string, fileName: string, download = false) {
  const params = new URLSearchParams({ filename: fileName });
  if (download) params.set("download", "1");
  return `/api/admin/whatsapp-media/${encodeURIComponent(mediaId)}?${params.toString()}`;
}

function enhanceParagraph(paragraph: HTMLParagraphElement) {
  const content = paragraph.textContent || "";
  const attachment = parseClientAttachmentChatContent(content);
  if (!attachment) return;

  const fingerprint = `${attachment.mediaId}:${attachment.fileName || ""}`;
  if (paragraph.dataset.clientAttachmentEnhanced === fingerprint) return;
  paragraph.dataset.clientAttachmentEnhanced = fingerprint;
  paragraph.style.display = "none";

  const existing = paragraph.parentElement?.querySelector<HTMLElement>("[data-client-attachment-card]");
  existing?.remove();

  const fileName = attachmentDisplayName(attachment);
  const card = document.createElement("div");
  card.className = "clientAttachmentCard";
  card.dataset.clientAttachmentCard = "true";

  const badge = document.createElement("span");
  badge.className = "clientAttachmentBadge";
  badge.textContent = attachment.kind === "document" ? "DOC" : attachment.kind === "image" ? "IMG" : attachment.kind === "audio" ? "AUDIO" : "VIDEO";

  const copy = document.createElement("div");
  copy.className = "clientAttachmentCopy";
  const name = document.createElement("strong");
  name.textContent = fileName;
  const meta = document.createElement("small");
  meta.textContent = attachment.mimeType || `${attachment.kind} attachment`;
  copy.append(name, meta);
  if (attachment.caption) {
    const caption = document.createElement("span");
    caption.textContent = attachment.caption;
    copy.append(caption);
  }

  const actions = document.createElement("div");
  actions.className = "clientAttachmentActions";
  const open = document.createElement("a");
  open.href = attachmentUrl(attachment.mediaId, fileName);
  open.target = "_blank";
  open.rel = "noreferrer";
  open.textContent = "Open";
  const download = document.createElement("a");
  download.href = attachmentUrl(attachment.mediaId, fileName, true);
  download.textContent = "Download";
  actions.append(open, download);

  card.append(badge, copy, actions);
  paragraph.insertAdjacentElement("afterend", card);
}

function enhanceAttachments() {
  if (!window.location.pathname.startsWith("/admin")) return;
  document.querySelectorAll<HTMLParagraphElement>(".messageTimeline .timelineBubble p").forEach(enhanceParagraph);
}

export function ClientAttachmentEnhancer() {
  useEffect(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    enhanceAttachments();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        enhanceAttachments();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(enhanceAttachments, 3000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
