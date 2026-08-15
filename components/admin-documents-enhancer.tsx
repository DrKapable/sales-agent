"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientDocumentSummary } from "@/lib/client-documents";

type ClientState = {
  id: string;
  phone: string;
  aiPaused: boolean;
  source: "whatsapp" | "simulator";
};

type DocumentPayload = {
  lead: ClientState;
  documents: ClientDocumentSummary[];
  maxBytes?: number;
  error?: string;
};

const ACCEPTED = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
const DEFAULT_MAX = 4 * 1024 * 1024;

function activePanel() {
  return document.querySelector<HTMLElement>(".conversationPanel");
}

function activePhone(panel: HTMLElement | null) {
  const text = panel?.querySelector<HTMLElement>(".clientIdentity > div > span")?.textContent || "";
  const first = text.split("·")[0]?.trim() || "";
  return first.replace(/\D/g, "") || null;
}

function activeSender(panel: HTMLElement | null) {
  const value = panel?.querySelector<HTMLSelectElement>(".composerTop select")?.value?.trim();
  return value || "Dr. Mustafa Juma Phiri";
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AdminDocumentsEnhancer() {
  const [phone, setPhone] = useState<string | null>(null);
  const [lead, setLead] = useState<ClientState | null>(null);
  const [documents, setDocuments] = useState<ClientDocumentSummary[]>([]);
  const [maxBytes, setMaxBytes] = useState(DEFAULT_MAX);
  const [drawerHost, setDrawerHost] = useState<HTMLElement | null>(null);
  const [attachHost, setAttachHost] = useState<HTMLElement | null>(null);
  const [toolsHost, setToolsHost] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const syncHosts = useCallback(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    const panel = activePanel();
    if (!panel) {
      setPhone(null);
      setDrawerHost(null);
      setAttachHost(null);
      setToolsHost(null);
      return;
    }
    const nextPhone = activePhone(panel);
    if (nextPhone && nextPhone !== phone) setPhone(nextPhone);

    let drawer = panel.querySelector<HTMLElement>("[data-client-documents-drawer-host]");
    if (!drawer) {
      drawer = document.createElement("div");
      drawer.dataset.clientDocumentsDrawerHost = "true";
      const composer = panel.querySelector(".replyComposer");
      if (composer?.parentElement) composer.parentElement.insertBefore(drawer, composer);
    }
    if (drawer && drawer !== drawerHost) setDrawerHost(drawer);

    const composerRow = panel.querySelector<HTMLElement>(".composerInputRow");
    let attach = composerRow?.querySelector<HTMLElement>("[data-client-documents-attach-host]") || null;
    if (composerRow && !attach) {
      attach = document.createElement("span");
      attach.dataset.clientDocumentsAttachHost = "true";
      composerRow.prepend(attach);
    }
    if (attach && attach !== attachHost) setAttachHost(attach);

    const controlStrip = panel.querySelector<HTMLElement>(".controlStrip");
    let tools = controlStrip?.querySelector<HTMLElement>("[data-client-documents-tools-host]") || null;
    if (controlStrip && !tools) {
      tools = document.createElement("div");
      tools.dataset.clientDocumentsToolsHost = "true";
      tools.className = "clientDocumentsToolsHost";
      controlStrip.appendChild(tools);
    }
    if (tools && tools !== toolsHost) setToolsHost(tools);
  }, [attachHost, drawerHost, phone, toolsHost]);

  useEffect(() => {
    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(syncHosts, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [syncHosts]);

  const loadDocuments = useCallback(async (targetPhone: string) => {
    try {
      const response = await fetch(`/api/admin/client-documents?phone=${encodeURIComponent(targetPhone)}`, { cache: "no-store" });
      const data = await response.json() as DocumentPayload;
      if (!response.ok) throw new Error(data.error || "Unable to load client documents.");
      setLead(data.lead);
      setDocuments(data.documents || []);
      if (data.maxBytes) setMaxBytes(data.maxBytes);
      setError("");
    } catch (err) {
      setLead(null);
      setDocuments([]);
      setError(err instanceof Error ? err.message : "Unable to load client documents.");
    }
  }, []);

  useEffect(() => {
    setNotice("");
    setError("");
    if (phone) void loadDocuments(phone);
    else {
      setLead(null);
      setDocuments([]);
    }
  }, [phone, loadDocuments]);

  async function upload(file: File) {
    if (!phone || busy) return;
    if (file.size > maxBytes) {
      setError(`This file is too large. The current limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const panel = activePanel();
      const form = new FormData();
      form.set("phone", phone);
      form.set("sender", activeSender(panel));
      form.set("file", file, file.name);
      const response = await fetch("/api/admin/client-documents", { method: "POST", body: form });
      const data = await response.json() as DocumentPayload;
      if (!response.ok) throw new Error(data.error || "Unable to assign the document.");
      setLead(data.lead);
      setDocuments(data.documents || []);
      if (data.maxBytes) setMaxBytes(data.maxBytes);
      setNotice(`${file.name} assigned to this client. Mary can send it when the client asks.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign the document.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function sendDocument(documentId: string) {
    if (!phone || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const panel = activePanel();
      const response = await fetch("/api/admin/client-documents/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, documentId, sender: activeSender(panel) })
      });
      const data = await response.json() as DocumentPayload & { delivery?: { status?: string } };
      if (!response.ok) throw new Error(data.error || "Unable to send the document.");
      setLead(data.lead);
      setDocuments(data.documents || []);
      setNotice(data.delivery?.status === "accepted" ? "Document accepted by Meta for WhatsApp delivery." : "Document recorded in the simulator conversation.");
      window.setTimeout(() => void loadDocuments(phone), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send the document.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(documentId: string) {
    if (!phone || busy || !window.confirm("Remove this document from the client? Mary will no longer be able to send it.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/client-documents?phone=${encodeURIComponent(phone)}&documentId=${encodeURIComponent(documentId)}`, { method: "DELETE" });
      const data = await response.json() as DocumentPayload;
      if (!response.ok) throw new Error(data.error || "Unable to remove the document.");
      setDocuments(data.documents || []);
      setNotice("Document removed from this client.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove the document.");
    } finally {
      setBusy(false);
    }
  }

  const fileInput = attachHost ? createPortal(
    <>
      <button type="button" className="clientDocumentAttachButton" aria-label="Upload and assign a document to this client" title="Upload document" disabled={!phone || busy} onClick={() => inputRef.current?.click()}>📎</button>
      <input ref={inputRef} className="clientDocumentFileInput" type="file" accept={ACCEPTED} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    </>,
    attachHost
  ) : null;

  const toolsUpload = toolsHost ? createPortal(
    <button type="button" className="clientDocumentsToolsUpload" disabled={!phone || busy} onClick={() => inputRef.current?.click()}>📎 Upload document</button>,
    toolsHost
  ) : null;

  const drawer = drawerHost && phone ? createPortal(
    <details className="clientDocumentsDrawer">
      <summary><span>📎 Client documents</span><b>{documents.length}</b><small>Assigned files Mary may send</small></summary>
      <div className="clientDocumentsBody">
        {notice && <div className="clientDocumentNotice">{notice}</div>}
        {error && <div className="clientDocumentError">{error}</div>}
        {!documents.length && <p className="clientDocumentsEmpty">No documents assigned yet. Use Upload document or the paperclip beside the reply box.</p>}
        {documents.map((document) => <article className="clientDocumentItem" key={document.id}>
          <div><strong>{document.title}</strong><span>{document.fileName} · {formatSize(document.sizeBytes)}</span><small>{document.lastSentAt ? `Last sent ${new Date(document.lastSentAt).toLocaleString()}` : `Assigned${document.uploadedBy ? ` by ${document.uploadedBy}` : ""}`}</small></div>
          <div className="clientDocumentActions"><button type="button" disabled={busy || !lead?.aiPaused} title={!lead?.aiPaused ? "Take over the chat to send manually. Mary can send it while AI mode is active." : "Send this document now"} onClick={() => void sendDocument(document.id)}>Send now</button><button type="button" className="danger" disabled={busy} onClick={() => void removeDocument(document.id)}>Remove</button></div>
        </article>)}
        <div className="clientDocumentsHint">Uploading assigns the file to this client. Mary cannot access documents assigned to another client.</div>
      </div>
    </details>,
    drawerHost
  ) : null;

  return <>{fileInput}{toolsUpload}{drawer}</>;
}
