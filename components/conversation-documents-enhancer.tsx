"use client";

import { createPortal } from "react-dom";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { documentDeliveryLabel, matchingCommercialDocument } from "@/lib/conversation-documents";

export type SharedDocument = {
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

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatAmount(value: number | null) {
  return value == null || !Number.isFinite(Number(value)) ? null : `K${Number(value).toLocaleString()}`;
}

function kindLabel(document: SharedDocument) {
  if (document.kind === "quotation") return "Quotation";
  if (document.kind === "invoice") return "Unpaid invoice";
  return "Shared file";
}

function isPdf(document: SharedDocument) {
  return document.mimeType === "application/pdf" || document.fileName.toLowerCase().endsWith(".pdf");
}

type DocumentsContext = {
  documents: SharedDocument[];
  error: string;
  loading: boolean;
  openDocument: (document: SharedDocument) => void;
  openDrawer: () => void;
  retry: () => void;
};
const DocumentsContext = createContext<DocumentsContext | null>(null);

export function ConversationDocumentsProvider({ phone, children }: { phone: string; children: ReactNode }) {
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<SharedDocument | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await fetch(`/api/admin/conversation-documents?phone=${encodeURIComponent(phone)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as Payload;
        if (!response.ok) throw new Error(data.error || "Unable to load shared documents.");
        if (!disposed) { setDocuments(data.documents || []); setError(""); }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : "Unable to load shared documents.");
      } finally {
        inFlight = false;
        if (!disposed) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => { disposed = true; controller?.abort(); window.clearInterval(timer); };
  }, [phone, revision]);

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
  const context = { documents, error, loading, openDocument, openDrawer: () => setDrawerOpen(true), retry: () => setRevision((value) => value + 1) };
  return <DocumentsContext.Provider value={context}>
    {children}

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
                  <span className="conversationDocumentTop"><strong>{kindLabel(document)}</strong><em className={`documentDeliveryStatus ${document.deliveryStatus.toLowerCase()}`}>{documentDeliveryLabel(document.deliveryStatus)}</em></span>
                  <b>{document.title}</b>
                  <span>{document.service || document.fileName}{document.service && amount ? ` · ${amount}` : ""}</span>
                  {document.details && <small>{document.details}</small>}
                  <span className="conversationDocumentMeta"><span>{document.sharedBy || "MedMinds"}</span><time>{formatDate(document.sharedAt || document.createdAt)}</time></span>
                  {document.deliveryError && <span className="conversationDocumentDeliveryError">{document.deliveryError}</span>}
                </span>
                <span className="conversationDocumentChevron" aria-hidden="true">›</span>
              </button>;
            })}
            {loading && <div className="conversationDocumentsEmpty">Loading documents…</div>}
            {!loading && !documents.length && <div className="conversationDocumentsEmpty">No documents yet.</div>}
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
          <footer><span>{kindLabel(previewDocument)} · {documentDeliveryLabel(previewDocument.deliveryStatus)}</span><a href={previewDocument.downloadUrl} download={previewDocument.fileName}>Download PDF</a><a href={previewDocument.downloadUrl} target="_blank" rel="noreferrer">Open externally</a></footer>
        </section>
      </div>,
      body
    ) : null}
  </DocumentsContext.Provider>;
}


export function ConversationDocumentsButton() {
  const context = useContext(DocumentsContext);
  if (!context) return null;
  return <button type="button" className="conversationDocumentsButton" aria-label={`Documents (${context.documents.length})`} title="Client documents" onClick={context.openDrawer}>
    <span className="conversationDocumentsButtonIcon" aria-hidden="true">▤</span>
    <span className="conversationDocumentsButtonLabel">Documents</span><b>{context.documents.length}</b>
  </button>;
}

function DocumentCard({ document, openDocument }: { document: SharedDocument; openDocument: (document: SharedDocument) => void }) {
  return <button type="button" className="conversationQuotationCard" onClick={() => openDocument(document)} aria-label={`View ${document.documentNumber || document.title}`}>
    <span className="conversationQuotationCardIcon" aria-hidden="true">PDF</span>
    <span className="conversationQuotationCardBody"><strong>{document.documentNumber || document.title}{formatAmount(document.amountZmw) ? ` · ${formatAmount(document.amountZmw)}` : ""}</strong><small>{document.service || document.fileName}</small><em className={`documentDeliveryStatus ${document.deliveryStatus.toLowerCase()}`}>{documentDeliveryLabel(document.deliveryStatus)}</em></span>
    <span className="conversationQuotationCardAction">View PDF ›</span>
  </button>;
}

export function ConversationDocumentsSummary() {
  const context = useContext(DocumentsContext);
  if (!context) return null;
  const latest = context.documents.find((item) => item.kind === "quotation" || item.kind === "invoice");
  return <div className="conversationDocumentsSummary">
    {latest ? <DocumentCard document={latest} openDocument={context.openDocument} /> : <button type="button" className="conversationDocumentsSummaryButton" onClick={context.openDrawer}>{context.loading ? "Loading client documents…" : `Client documents (${context.documents.length})`} ›</button>}
    {latest && <button type="button" className="conversationDocumentsSummaryButton" onClick={context.openDrawer}>All documents ({context.documents.length}) ›</button>}
    {context.error && <div className="conversationSharedDocumentsError" role="status">{context.error} <button type="button" onClick={context.retry}>Retry</button></div>}
  </div>;
}

export function ConversationDocumentAttachment({ content }: { content: string }) {
  const context = useContext(DocumentsContext);
  if (!context) return null;
  const document = matchingCommercialDocument(content, context.documents);
  return document ? <DocumentCard document={document} openDocument={context.openDocument} /> : null;
}
