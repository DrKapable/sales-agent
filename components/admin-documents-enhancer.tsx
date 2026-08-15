"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { ClientDocumentSummary, ClientDocumentUsage } from "@/lib/client-documents";

type ClientState = {
  id: string;
  phone: string;
  aiPaused: boolean;
  source: "whatsapp" | "simulator";
};

type ReplyWindowState = { open: boolean; expiresAt: string | null };

type DocumentPayload = {
  lead: ClientState;
  documents: ClientDocumentSummary[];
  usage?: ClientDocumentUsage;
  replyWindow?: ReplyWindowState;
  maxBytes?: number;
  error?: string;
  code?: string;
  existingDocumentId?: string | null;
};

const ACCEPTED = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
const DEFAULT_MAX = 4 * 1024 * 1024;
const EMPTY_USAGE: ClientDocumentUsage = { count: 0, maxCount: 20, totalBytes: 0, maxTotalBytes: 24 * 1024 * 1024 };

function activePanel() {
  return document.querySelector<HTMLElement>(".conversationPanel");
}

function activeClient(panel: HTMLElement | null) {
  const identity = panel?.querySelector<HTMLElement>(".clientIdentity");
  const text = identity?.querySelector<HTMLElement>("div > span")?.textContent || "";
  const first = text.split("·")[0]?.trim() || "";
  return {
    phone: first.replace(/\D/g, "") || null,
    name: identity?.querySelector<HTMLElement>("strong")?.textContent?.trim() || "Client"
  };
}

function activeSender(panel: HTMLElement | null) {
  const value = panel?.querySelector<HTMLSelectElement>(".composerTop select")?.value?.trim();
  return value || "Dr. Mustafa Juma Phiri";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileKind(fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase() || "FILE";
  if (["DOC", "DOCX"].includes(extension)) return "DOC";
  if (["XLS", "XLSX"].includes(extension)) return "XLS";
  if (["PPT", "PPTX"].includes(extension)) return "PPT";
  return extension.slice(0, 4);
}

function titleFromFile(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || fileName;
}

function friendlyDate(value: string) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AdminDocumentsEnhancer() {
  const [phone, setPhone] = useState<string | null>(null);
  const [clientName, setClientName] = useState("Client");
  const [lead, setLead] = useState<ClientState | null>(null);
  const [documents, setDocuments] = useState<ClientDocumentSummary[]>([]);
  const [usage, setUsage] = useState<ClientDocumentUsage>(EMPTY_USAGE);
  const [replyWindow, setReplyWindow] = useState<ReplyWindowState>({ open: false, expiresAt: null });
  const [maxBytes, setMaxBytes] = useState(DEFAULT_MAX);
  const [attachHost, setAttachHost] = useState<HTMLElement | null>(null);
  const [toolsHost, setToolsHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [sendTarget, setSendTarget] = useState<ClientDocumentSummary | null>(null);
  const [caption, setCaption] = useState("");
  const [renameTarget, setRenameTarget] = useState<ClientDocumentSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const syncHosts = useCallback(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    const panel = activePanel();
    if (!panel) {
      setPhone(null);
      setAttachHost(null);
      setToolsHost(null);
      return;
    }
    const nextClient = activeClient(panel);
    if (nextClient.phone && nextClient.phone !== phone) {
      setPhone(nextClient.phone);
      setClientName(nextClient.name);
      setOpen(false);
      setSelectedFile(null);
      setSendTarget(null);
      setRenameTarget(null);
    } else if (nextClient.name !== clientName) {
      setClientName(nextClient.name);
    }

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
  }, [attachHost, clientName, phone, toolsHost]);

  useEffect(() => {
    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(syncHosts, 1200);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [syncHosts]);

  const applyPayload = useCallback((data: DocumentPayload) => {
    setLead(data.lead);
    setDocuments(data.documents || []);
    if (data.usage) setUsage(data.usage);
    if (data.replyWindow) setReplyWindow(data.replyWindow);
    if (data.maxBytes) setMaxBytes(data.maxBytes);
  }, []);

  const loadDocuments = useCallback(async (targetPhone: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/admin/client-documents?phone=${encodeURIComponent(targetPhone)}`, { cache: "no-store" });
      const data = await response.json() as DocumentPayload;
      if (!response.ok) throw new Error(data.error || "Unable to load client documents.");
      applyPayload(data);
      setError("");
    } catch (err) {
      if (!quiet) setError(err instanceof Error ? err.message : "Unable to load client documents.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    setNotice("");
    setError("");
    if (phone) void loadDocuments(phone, true);
    else {
      setLead(null);
      setDocuments([]);
      setUsage(EMPTY_USAGE);
    }
  }, [phone, loadDocuments]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("clientDocumentsModalOpen");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        if (sendTarget) setSendTarget(null);
        else if (renameTarget) setRenameTarget(null);
        else setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("clientDocumentsModalOpen");
      document.removeEventListener("keydown", onKey);
    };
  }, [busy, open, renameTarget, sendTarget]);

  const canManualSend = Boolean(lead?.aiPaused && (lead.source !== "whatsapp" || replyWindow.open));
  const usagePercent = Math.min(100, Math.round((usage.totalBytes / Math.max(1, usage.maxTotalBytes)) * 100));
  const sortedDocuments = useMemo(() => [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [documents]);

  function openManager() {
    if (!phone) return;
    setOpen(true);
    setNotice("");
    setError("");
    void loadDocuments(phone);
  }

  function chooseFile(file: File) {
    setError("");
    setNotice("");
    if (file.size <= 0) {
      setError("The selected document is empty.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`This file is too large. The per-file limit is ${formatSize(maxBytes)}.`);
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop() || "";
    if (!["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(extension)) {
      setError("Use PDF, Word, Excel, PowerPoint, TXT or CSV files.");
      return;
    }
    setSelectedFile(file);
    setTitleDraft(titleFromFile(file.name));
    setOpen(true);
  }

  async function uploadSelected() {
    if (!phone || !selectedFile || busy) return;
    if (!titleDraft.trim()) {
      setError("Add a clear title before assigning this document.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("phone", phone);
      form.set("sender", activeSender(activePanel()));
      form.set("title", titleDraft.trim());
      form.set("file", selectedFile, selectedFile.name);
      const response = await fetch("/api/admin/client-documents", { method: "POST", body: form });
      const data = await response.json() as DocumentPayload;
      if (!response.ok) {
        if (data.documents) applyPayload(data);
        throw new Error(data.error || "Unable to assign the document.");
      }
      applyPayload(data);
      setNotice(`${selectedFile.name} is now assigned only to ${clientName}.`);
      setSelectedFile(null);
      setTitleDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign the document.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function sendDocument() {
    if (!phone || !sendTarget || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/client-documents/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, documentId: sendTarget.id, sender: activeSender(activePanel()), caption: caption.trim() || undefined })
      });
      const data = await response.json() as DocumentPayload & { delivery?: { status?: string } };
      if (!response.ok) throw new Error(data.error || "Unable to send the document.");
      applyPayload(data);
      setNotice(data.delivery?.status === "accepted" ? `${sendTarget.title} was accepted by Meta for WhatsApp delivery.` : `${sendTarget.title} was added to the simulator conversation.`);
      setSendTarget(null);
      setCaption("");
      window.setTimeout(() => { if (phone) void loadDocuments(phone, true); }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send the document.");
    } finally {
      setBusy(false);
    }
  }

  async function renameDocument() {
    if (!phone || !renameTarget || !renameTitle.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/client-documents/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, title: renameTitle.trim() })
      });
      const data = await response.json() as { document?: ClientDocumentSummary; error?: string };
      if (!response.ok || !data.document) throw new Error(data.error || "Unable to rename the document.");
      const updated = data.document;
      setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item));
      setRenameTarget(null);
      setRenameTitle("");
      setNotice("Document title updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename the document.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(document: ClientDocumentSummary) {
    if (!phone || busy || !window.confirm(`Remove “${document.title}” from ${clientName}? Mary will no longer be able to send it.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/client-documents?phone=${encodeURIComponent(phone)}&documentId=${encodeURIComponent(document.id)}`, { method: "DELETE" });
      const data = await response.json() as DocumentPayload;
      if (!response.ok) throw new Error(data.error || "Unable to remove the document.");
      applyPayload(data);
      setNotice(`${document.title} was removed from this client.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove the document.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) chooseFile(file);
  }

  const attachControl = attachHost ? createPortal(
    <button type="button" className="clientDocumentAttachButton" aria-label={`Manage documents for ${clientName}`} title="Client documents" disabled={!phone} onClick={openManager}>
      <span aria-hidden="true">📎</span>{documents.length > 0 ? <b>{documents.length > 9 ? "9+" : documents.length}</b> : null}
    </button>,
    attachHost
  ) : null;

  const toolsControl = toolsHost ? createPortal(
    <button type="button" className="clientDocumentsToolsUpload" disabled={!phone} onClick={openManager}><span aria-hidden="true">📎</span> Documents{documents.length ? ` (${documents.length})` : ""}</button>,
    toolsHost
  ) : null;

  const manager = open && phone ? createPortal(
    <div className="clientDocumentsModal" role="dialog" aria-modal="true" aria-label={`Documents assigned to ${clientName}`} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="clientDocumentsDialog">
        <header className="clientDocumentsHeader">
          <div><span className="clientDocumentsEyebrow">Client-specific files</span><h2>Documents for {clientName}</h2><p>{phone} · Mary can access only the files assigned here.</p></div>
          <button type="button" className="clientDocumentsClose" aria-label="Close document manager" disabled={busy} onClick={() => setOpen(false)}>×</button>
        </header>

        <div className="clientDocumentsStatusBar">
          <div><strong>{usage.count}/{usage.maxCount}</strong><span>files</span></div>
          <div><strong>{formatSize(usage.totalBytes)}</strong><span>of {formatSize(usage.maxTotalBytes)}</span></div>
          <div className={`clientDocumentsMode ${canManualSend ? "ready" : "guarded"}`}><strong>{lead?.aiPaused ? (lead.source === "whatsapp" && !replyWindow.open ? "Window closed" : "Human mode") : "Mary active"}</strong><span>{lead?.aiPaused ? (lead.source === "whatsapp" && !replyWindow.open ? "Manual sending unavailable" : "Manual sending available") : "Can send assigned files on request"}</span></div>
        </div>
        <div className="clientDocumentsUsageTrack" aria-label={`${usagePercent}% of client document storage used`}><span style={{ width: `${usagePercent}%` }} /></div>

        {notice ? <div className="clientDocumentNotice" role="status">✓ {notice}</div> : null}
        {error ? <div className="clientDocumentError" role="alert">{error}</div> : null}

        <div className="clientDocumentsContent">
          <section className="clientDocumentsUploadCard">
            <div className={`clientDocumentsDropZone ${dragActive ? "dragActive" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={onDrop}>
              <div className="clientDocumentsDropIcon" aria-hidden="true">＋</div>
              <div><strong>Assign a document</strong><p>Drop a file here or choose one from your device.</p><small>PDF, Word, Excel, PowerPoint, TXT or CSV · up to {formatSize(maxBytes)}</small></div>
              <button type="button" className="clientDocumentsChooseButton" disabled={busy || usage.count >= usage.maxCount} onClick={() => inputRef.current?.click()}>Choose file</button>
            </div>
            {selectedFile ? <div className="clientDocumentsSelectedFile">
              <span className={`clientDocumentType type-${fileKind(selectedFile.name).toLowerCase()}`}>{fileKind(selectedFile.name)}</span>
              <div className="clientDocumentsSelectedMeta"><strong>{selectedFile.name}</strong><span>{formatSize(selectedFile.size)}</span><label>Display title<input value={titleDraft} maxLength={180} onChange={(event) => setTitleDraft(event.target.value)} placeholder="Clear title Mary can identify" /></label></div>
              <div className="clientDocumentsSelectedActions"><button type="button" className="button buttonPrimary" disabled={busy || !titleDraft.trim()} onClick={() => void uploadSelected()}>{busy ? "Assigning..." : `Assign to ${clientName}`}</button><button type="button" className="button buttonGhost" disabled={busy} onClick={() => { setSelectedFile(null); setTitleDraft(""); if (inputRef.current) inputRef.current.value = ""; }}>Cancel</button></div>
            </div> : null}
          </section>

          <section className="clientDocumentsLibrary">
            <div className="clientDocumentsLibraryHeader"><div><h3>Assigned documents</h3><p>Only these files are available to Mary in this client’s WhatsApp conversation.</p></div><button type="button" className="clientDocumentsRefresh" disabled={loading || busy} onClick={() => void loadDocuments(phone)}>{loading ? "Refreshing..." : "Refresh"}</button></div>
            {loading && !documents.length ? <div className="clientDocumentsEmpty"><span>⌛</span><strong>Loading documents...</strong></div> : null}
            {!loading && !documents.length ? <div className="clientDocumentsEmpty"><span>📄</span><strong>No documents assigned yet</strong><p>Assigning a file here does not send it automatically. Mary sends it only when the client asks or an administrator sends it manually.</p></div> : null}
            <div className="clientDocumentsList">{sortedDocuments.map((document) => <article className="clientDocumentItem" key={document.id}>
              <span className={`clientDocumentType type-${fileKind(document.fileName).toLowerCase()}`}>{fileKind(document.fileName)}</span>
              <div className="clientDocumentMeta"><div className="clientDocumentTitleRow"><strong>{document.title}</strong>{document.sendCount > 0 ? <span className="clientDocumentSentPill">Sent {document.sendCount}×</span> : <span className="clientDocumentUnsentPill">Not sent</span>}</div><span>{document.fileName} · {formatSize(document.sizeBytes)}</span><small>Assigned {friendlyDate(document.createdAt)}{document.uploadedBy ? ` by ${document.uploadedBy}` : ""}</small>{document.lastSentAt ? <small className="clientDocumentLastSent">Last sent {friendlyDate(document.lastSentAt)}{document.lastSentBy ? ` by ${document.lastSentBy}` : ""}</small> : null}</div>
              <div className="clientDocumentActions"><a href={`/api/admin/client-documents/${document.id}?phone=${encodeURIComponent(phone)}`} target="_blank" rel="noreferrer">Open</a><button type="button" disabled={busy} onClick={() => { setRenameTarget(document); setRenameTitle(document.title); }}>Rename</button><button type="button" className="send" disabled={busy || !canManualSend} title={!lead?.aiPaused ? "Take over the chat to send manually. Mary can still send this on request." : lead.source === "whatsapp" && !replyWindow.open ? "The WhatsApp 24-hour reply window is closed." : "Send this document now"} onClick={() => { setSendTarget(document); setCaption(""); }}>Send</button><button type="button" className="danger" disabled={busy} onClick={() => void removeDocument(document)}>Remove</button></div>
            </article>)}</div>
          </section>
        </div>

        <footer className="clientDocumentsFooter"><span>Security: documents are isolated by client ID and are never exposed to Mary as raw file bytes or public URLs.</span><button type="button" className="button buttonGhost" disabled={busy} onClick={() => setOpen(false)}>Done</button></footer>

        {sendTarget ? <div className="clientDocumentsConfirmLayer" role="dialog" aria-modal="true" aria-label={`Send ${sendTarget.title}`}>
          <section className="clientDocumentsConfirmCard"><span className={`clientDocumentType large type-${fileKind(sendTarget.fileName).toLowerCase()}`}>{fileKind(sendTarget.fileName)}</span><div className="clientDocumentsConfirmCopy"><span>Send document</span><h3>{sendTarget.title}</h3><p>This will send the actual attachment to <strong>{clientName}</strong> at {phone}.</p><label>Optional WhatsApp caption<textarea value={caption} maxLength={1024} onChange={(event) => setCaption(event.target.value)} placeholder="Add a short message with the document..." /></label><small>{lead?.source === "whatsapp" ? "Meta must accept the attachment before it is recorded as sent." : "This is a simulator conversation; no WhatsApp attachment will leave the system."}</small></div><div className="clientDocumentsConfirmActions"><button type="button" className="button buttonPrimary" disabled={busy} onClick={() => void sendDocument()}>{busy ? "Sending..." : "Send document"}</button><button type="button" className="button buttonGhost" disabled={busy} onClick={() => { setSendTarget(null); setCaption(""); }}>Cancel</button></div></section>
        </div> : null}

        {renameTarget ? <div className="clientDocumentsConfirmLayer" role="dialog" aria-modal="true" aria-label={`Rename ${renameTarget.title}`}>
          <section className="clientDocumentsRenameCard"><div><span>Rename display title</span><h3>{renameTarget.fileName}</h3><p>The original filename stays unchanged. This title helps administrators and Mary identify the correct document.</p></div><input autoFocus value={renameTitle} maxLength={180} onChange={(event) => setRenameTitle(event.target.value)} /><div><button type="button" className="button buttonPrimary" disabled={busy || !renameTitle.trim()} onClick={() => void renameDocument()}>{busy ? "Saving..." : "Save title"}</button><button type="button" className="button buttonGhost" disabled={busy} onClick={() => { setRenameTarget(null); setRenameTitle(""); }}>Cancel</button></div></section>
        </div> : null}
      </section>
    </div>,
    document.body
  ) : null;

  return <>
    <input ref={inputRef} className="clientDocumentFileInput" type="file" accept={ACCEPTED} onChange={(event) => { const file = event.target.files?.[0]; if (file) chooseFile(file); }} />
    {attachControl}{toolsControl}{manager}
  </>;
}
