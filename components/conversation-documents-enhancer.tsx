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
    case "ACCEPTED": return "Accepted";
    case "SENT": return "Sent";
    case "DELIVERED": return "Delivered";
    case "READ": return "Read";
    case "FAILED": return "Failed";
    default: return "Created";
  }
}

function kindLabel(document: SharedDocument) {
  if (document.kind === "quotation") return "Quotation";
  if (document.kind === "invoice") return "Unpaid invoice";
  return "Shared file";
}

function isPdf(document: SharedDocument) {
  return document.mimeType === "application/pdf" || document.fileName.toLowerCase().endsWith(".pdf");
}

export function ConversationDocumentsEnhancer() {
  const [phone, setPhone] = useState<string | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<SharedDocument | null>(null);
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
      setDrawerOpen(false);
      setPreviewDocument(null);
      setError("");
    }
    const nextHost = panel?.querySelector<HTMLElement>(".conversationActions") || null;
    setActionsHost((current) => current === nextHost ? current : nextHost);
  }, []);

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

  useEffect(() => {
    const modalOpen = drawerOpen || Boolean(previewDocument);
    document.body.classList.toggle("conversationDocumentModalOpen", modalOpen);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewDocument) setPreviewDocument(null);
      else if (drawerOpen) setDrawerOpen(false);
    };
    if (modalOpen) document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("conversationDocumentModalOpen");
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen, previewDocument]);

  function openDocument(document: SharedDocument) {
    if (isPdf(document)) {
      setPreviewDocument(document);
      return;
    }
    window.open(document.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const body = typeof document === "undefined" ? null : document.body;
  if (!phone) return null;

  return <>
    {actionsHost && documents.length ? createPortal(
      <button type="button" className="conversationDocumentsButton" aria-label={`Shared documents (${documents.length})`} title="Shared documents" onClick={() => setDrawerOpen(true)}>
        <span className="conversationDocumentsButtonIcon" aria-hidden="true">▤</span>
        <span className="conversationDocumentsButtonLabel">Documents</span>
        <b>{documents.length}</b>
      </button>,
      actionsHost
    ) : null}

    {body && drawerOpen ? createPortal(
      <div className="conversationDocumentsOverlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
        <section className="conversationDocumentsDrawer" role="dialog" aria-modal="true" aria-label="Shared documents">
          <header className="conversationDocumentsDrawerHeader">
            <div><span>Client files</span><strong>Shared documents</strong><small>{documents.length} document{documents.length === 1 ? "" : "s"} in this conversation</small></div>
            <button type="button" aria-label="Close shared documents" onClick={() => setDrawerOpen(false)}>×</button>
          </header>
          {error && <div className="conversationSharedDocumentsError">{error}</div>}
          <div className="conversationDocumentsDrawerList">
            {documents.map((document) => {
              const amount = formatAmount(document.amountZmw);
              return <button type="button" className="conversationDocumentRow" key={`${document.kind}:${document.id}`} onClick={() => openDocument(document)}>
                <span className="conversationDocumentIcon" aria-hidden="true">{isPdf(document) ? "PDF" : "FILE"}</span>
                <span className="conversationDocumentRowBody">
                  <span className="conversationDocumentTop"><strong>{kindLabel(document)}</strong><em className={`documentDeliveryStatus ${document.deliveryStatus.toLowerCase()}`}>{deliveryLabel(document.deliveryStatus)}</em></span>
                  <b>{document.title}</b>
                  <span>{document.service || document.fileName}{document.service && amount ? ` · ${amount}` : ""}</span>
                  {document.details && <small>{document.details}</small>}
                  <span className="conversationDocumentMeta"><span>{document.sharedBy || "MedMinds"}</span><time>{formatDate(document.sharedAt || document.createdAt)}</time></span>
                  {document.deliveryError && <span className="conversationDocumentDeliveryError">{document.deliveryError}</span>}
                </span>
                <span className="conversationDocumentChevron" aria-hidden="true">›</span>
              </button>;
            })}
            {!documents.length && <div className="conversationDocumentsEmpty">No shared documents yet.</div>}
          </div>
        </section>
      </div>,
      body
    ) : null}

    {body && previewDocument ? createPortal(
      <div className="conversationDocumentPreviewOverlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setPreviewDocument(null); }}>
        <section className="conversationDocumentPreview" role="dialog" aria-modal="true" aria-label={`Preview ${previewDocument.title}`}>
          <header>
            <button type="button" className="conversationDocumentPreviewBack" aria-label="Back to documents" onClick={() => setPreviewDocument(null)}>←</button>
            <div><strong>{previewDocument.title}</strong><span>{previewDocument.fileName}</span></div>
            <a href={previewDocument.downloadUrl} target="_blank" rel="noreferrer" aria-label="Open document in a new tab">↗</a>
          </header>
          <iframe src={`${previewDocument.downloadUrl}#toolbar=0&navpanes=0`} title={previewDocument.title} />
          <footer><span>{kindLabel(previewDocument)} · {deliveryLabel(previewDocument.deliveryStatus)}</span><a href={previewDocument.downloadUrl} target="_blank" rel="noreferrer">Open externally</a></footer>
        </section>
      </div>,
      body
    ) : null}
  </>;
}
