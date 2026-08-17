"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

type SharedDocument = {
  id: string;
  kind: "quotation" | "invoice" | "shared_file";
  title: string;
  fileName: string;
  mimeType: string;
  service: string | null;
  amountZmw: number | null;
  details: string | null;
  documentNumber: string | null;
  createdAt: string;
  sharedAt: string;
  sharedBy: string | null;
  deliveryStatus: string;
  deliveryError: string | null;
  downloadUrl: string;
};

type Payload = { phone?: string; documents?: SharedDocument[]; error?: string };

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function phoneFromText(value: string | null | undefined) {
  if (!value) return null;
  const matches = value.match(/\+?\d[\d\s()\-]{6,}\d/g) || [];
  for (const match of matches) {
    const valueDigits = digits(match);
    if (valueDigits.length >= 8 && valueDigits.length <= 15) return valueDigits;
  }
  return null;
}

function activeConversationPanel() {
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".conversationPanel"));
  return panels.find((panel) => {
    const rect = panel.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || panels.at(-1) || null;
}

function activePhone(panel: HTMLElement | null) {
  if (!panel) return null;
  const identity = panel.querySelector<HTMLElement>(".clientIdentity")?.textContent;
  const selected = document.querySelector<HTMLElement>(".leadListItem.selected")?.textContent;
  return phoneFromText(identity) || phoneFromText(selected) || null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatAmount(value: number | null) {
  return value == null || !Number.isFinite(Number(value)) ? null : `K${Number(value).toLocaleString()}`;
}

function deliveryLabel(status: string) {
  switch (status.toUpperCase()) {
    case "ACCEPTED": return "Accepted by Meta";
    case "SENT": return "Sent";
    case "DELIVERED": return "Delivered";
    case "READ": return "Read";
    case "FAILED": return "Delivery failed";
    default: return "Document created";
  }
}

function kindLabel(document: SharedDocument) {
  if (document.kind === "quotation") return "Quotation";
  if (document.kind === "invoice") return "Unpaid invoice";
  return "Shared file";
}

export function ConversationDocumentsEnhancer() {
  const [phone, setPhone] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [error, setError] = useState("");
  const phoneRef = useRef<string | null>(null);

  const sync = useCallback(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    const panel = activeConversationPanel();
    const nextPhone = activePhone(panel);
    if (nextPhone !== phoneRef.current) {
      phoneRef.current = nextPhone;
      setPhone(nextPhone);
      setDocuments([]);
      setError("");
    }

    const timeline = panel?.querySelector<HTMLElement>(".messageTimeline") || null;
    let nextHost = timeline?.querySelector<HTMLElement>("[data-conversation-shared-documents]") || null;
    if (timeline && !nextHost) {
      nextHost = document.createElement("div");
      nextHost.dataset.conversationSharedDocuments = "true";
      timeline.appendChild(nextHost);
    }
    if (nextHost !== host) setHost(nextHost);
  }, [host]);

  useEffect(() => {
    sync();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(sync, 2500);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sync]);

  const load = useCallback(async () => {
    if (!phone) return;
    try {
      const response = await fetch(`/api/admin/conversation-documents?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
      const data = await response.json() as Payload;
      if (!response.ok) throw new Error(data.error || "Unable to load shared documents.");
      setDocuments(data.documents || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load shared documents.");
    }
  }, [phone]);

  useEffect(() => {
    if (!phone) return;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load, phone]);

  if (!host || !phone || (!documents.length && !error)) return null;

  return createPortal(
    <section className="conversationSharedDocuments" aria-label="Shared documents">
      <div className="conversationSharedDocumentsHeader">
        <div><span>Documents</span><strong>Shared in this conversation</strong></div>
        <b>{documents.length}</b>
      </div>
      {error && <div className="conversationSharedDocumentsError">{error}</div>}
      <div className="conversationSharedDocumentsList">
        {documents.map((document) => {
          const amount = formatAmount(document.amountZmw);
          const status = deliveryLabel(document.deliveryStatus);
          return <article className="conversationDocumentCard" key={`${document.kind}:${document.id}`}>
            <div className="conversationDocumentIcon" aria-hidden="true">PDF</div>
            <div className="conversationDocumentBody">
              <div className="conversationDocumentTop"><span>{kindLabel(document)}</span><em className={`documentDeliveryStatus ${document.deliveryStatus.toLowerCase()}`}>{status}</em></div>
              <strong>{document.title}</strong>
              {document.service && <p>{document.service}{amount ? ` · ${amount}` : ""}</p>}
              {!document.service && <p>{document.fileName}</p>}
              {document.details && <small>{document.details}</small>}
              <div className="conversationDocumentMeta"><span>{document.sharedBy || "MedMinds"}</span><time>{formatDate(document.sharedAt || document.createdAt)}</time></div>
              {document.deliveryError && <div className="conversationDocumentDeliveryError">{document.deliveryError}</div>}
            </div>
            <a className="conversationDocumentOpen" href={document.downloadUrl} target="_blank" rel="noreferrer" aria-label={`Open ${document.title}`}>Open document</a>
          </article>;
        })}
      </div>
    </section>,
    host
  );
}
