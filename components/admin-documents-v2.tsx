"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { ClientDocumentSummary, ClientDocumentUsage } from "@/lib/client-documents";

type ClientState = { id: string; phone: string; aiPaused: boolean; source: "whatsapp" | "simulator" };
type ReplyWindowState = { open: boolean; expiresAt: string | null };
type DocumentPayload = {
  lead: ClientState;
  documents: ClientDocumentSummary[];
  usage?: ClientDocumentUsage;
  replyWindow?: ReplyWindowState;
  maxBytes?: number;
  error?: string;
};
type ActiveClient = { phone: string; name: string };
type PendingDocument = { key: string; file: File; title: string };

const ACCEPTED = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"]);
const DEFAULT_MAX = 4 * 1024 * 1024;
const EMPTY_USAGE: ClientDocumentUsage = { count: 0, maxCount: 20, totalBytes: 0, maxTotalBytes: 24 * 1024 * 1024 };

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function phoneFromText(value: string | null | undefined) {
  if (!value) return null;
  const matches = value.match(/\+?\d[\d\s()\-]{6,}\d/g) || [];
  for (const match of matches) {
    const normalized = digits(match);
    if (normalized.length >= 8 && normalized.length <= 15) return normalized;
  }
  return null;
}

function activePanel() {
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".conversationPanel"));
  return panels.find((panel) => {
    const rect = panel.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || panels.at(-1) || null;
}

function resolveActiveClient(panel: HTMLElement | null): ActiveClient | null {
  if (!panel) return null;
  const identity = panel.querySelector<HTMLElement>(".clientIdentity");
  const selected = document.querySelector<HTMLElement>(".leadListItem.selected");
  const candidates = [
    panel.dataset.clientPhone,
    identity?.textContent,
    selected?.querySelector<HTMLElement>(".leadListCopy em")?.textContent,
    selected?.textContent
  ];
  const phone = candidates.map(phoneFromText).find(Boolean) || null;
  if (!phone) return null;
  const name = identity?.querySelector<HTMLElement>("strong")?.textContent?.trim()
    || selected?.querySelector<HTMLElement>(".leadListCopy strong")?.textContent?.trim()
    || "Client";
  return { phone, name };
}

function activeSender(panel: HTMLElement | null) {
  return panel?.querySelector<HTMLSelectElement>(".composerTop select")?.value?.trim() || "Dr. Mustafa Juma Phiri";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileKind(fileName: string) {
  const ext = fileName.split(".").pop()?.toUpperCase() || "FILE";
  if (["DOC", "DOCX"].includes(ext)) return "DOC";
  if (["XLS", "XLSX"].includes(ext)) return "XLS";
  if (["PPT", "PPTX"].includes(ext)) return "PPT";
  return ext.slice(0, 4);
}

function titleFromFile(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || fileName;
}

function pendingKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

function friendlyDate(value: string) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AdminDocumentsV2() {
  const [client, setClient] = useState<ActiveClient | null>(null);
  const [lead, setLead] = useState<ClientState | null>(null);
  const [documents, setDocuments] = useState<ClientDocumentSummary[]>([]);
  const [usage, setUsage] = useState<ClientDocumentUsage>(EMPTY_USAGE);
  const [replyWindow, setReplyWindow] = useState<ReplyWindowState>({ open: false, expiresAt: null });
  const [maxBytes, setMaxBytes] = useState(DEFAULT_MAX);
  const [attachHost, setAttachHost] = useState<HTMLElement | null>(null);
  const [toolsHost, setToolsHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingDocument[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<ActiveClient | null>(null);

  const sync = useCallback(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    const panel = activePanel();
    const nextClient = resolveActiveClient(panel);
    const previousPhone = clientRef.current?.phone || null;
    const nextPhone = nextClient?.phone || null;
    if (nextPhone !== previousPhone) {
      clientRef.current = nextClient;
      setClient(nextClient);
      setLead(null);
      setDocuments([]);
      setUsage(EMPTY_USAGE);
      setReplyWindow({ open: false, expiresAt: null });
      setPending([]);
      setOpen(false);
      setNotice("");
      setError("");
      if (inputRef.current) inputRef.current.value = "";
    } else if (nextClient && nextClient.name !== clientRef.current?.name) {
      clientRef.current = nextClient;
      setClient(nextClient);
    }

    const composer = panel?.querySelector<HTMLElement>(".composerInputRow") || null;
    let attach = composer?.querySelector<HTMLElement>("[data-client-documents-v2-attach]") || null;
    if (composer && !attach) {
      attach = document.createElement("span");
      attach.dataset.clientDocumentsV2Attach = "true";
      composer.prepend(attach);
    }
    if (attach !== attachHost) setAttachHost(attach);

    const controls = panel?.querySelector<HTMLElement>(".controlStrip") || null;
    let tools = controls?.querySelector<HTMLElement>("[data-client-documents-v2-tools]") || null;
    if (controls && !tools) {
      tools = document.createElement("div");
      tools.dataset.clientDocumentsV2Tools = "true";
      tools.className = "clientDocumentsToolsHost";
      controls.appendChild(tools);
    }
    if (tools !== toolsHost) setToolsHost(tools);
  }, [attachHost, toolsHost]);

  useEffect(() => {
    sync();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; sync(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(sync, 2500);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sync]);

  const applyPayload = useCallback((data: DocumentPayload) => {
    setLead(data.lead);
    setDocuments(data.documents || []);
    if (data.usage) setUsage(data.usage);
    if (data.replyWindow) setReplyWindow(data.replyWindow);
    if (data.maxBytes) setMaxBytes(data.maxBytes);
  }, []);

  const loadDocuments = useCallback(async () => {
    const current = clientRef.current;
    if (!current) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/client-documents?phone=${encodeURIComponent(current.phone)}`, { cache: "no-store" });
      const data = await response.json() as DocumentPayload;
      if (!response.ok) throw new Error(data.error || "Unable to load client documents.");
      applyPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load client documents.");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  function openManager() {
    if (!clientRef.current) {
      sync();
      return;
    }
    setOpen(true);
    setNotice("");
    setError("");
    void loadDocuments();
  }

  function openPicker() {
    if (!inputRef.current || busy) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }

  function addFiles(files: File[]) {
    if (!files.length) return;
    setOpen(true);
    setNotice("");
    const problems: string[] = [];
    const accepted: PendingDocument[] = [];
    const existing = new Set(pending.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    const available = Math.max(0, usage.maxCount - usage.count - pending.length);

    for (const file of files) {
      if (accepted.length >= available) { problems.push("The client document limit has been reached."); break; }
      const extension = file.name.toLowerCase().split(".").pop() || "";
      if (!ALLOWED_EXTENSIONS.has(extension)) { problems.push(`${file.name}: unsupported type.`); continue; }
      if (file.size <= 0) { problems.push(`${file.name}: empty file.`); continue; }
      if (file.size > maxBytes) { problems.push(`${file.name}: larger than ${formatSize(maxBytes)}.`); continue; }
      const signature = `${file.name}:${file.size}:${file.lastModified}`;
      if (existing.has(signature)) { problems.push(`${file.name}: already selected.`); continue; }
      existing.add(signature);
      accepted.push({ key: pendingKey(file), file, title: titleFromFile(file.name) });
    }
    if (accepted.length) setPending((current) => [...current, ...accepted]);
    setError(problems.join(" "));
  }

  async function uploadPending() {
    const current = clientRef.current;
    if (!current || !pending.length || busy) return;
    if (pending.some((item) => !item.title.trim())) { setError("Add a title for every document."); return; }
    setBusy(true);
    setError("");
    setNotice("");
    const failed: PendingDocument[] = [];
    const failures: string[] = [];
    let uploaded = 0;
    try {
      for (const item of pending) {
        try {
          const form = new FormData();
          form.set("phone", current.phone);
          form.set("sender", activeSender(activePanel()));
          form.set("title", item.title.trim());
          form.set("file", item.file, item.file.name);
          const response = await fetch("/api/admin/client-documents", { method: "POST", body: form });
          const data = await response.json() as DocumentPayload;
          if (!response.ok) throw new Error(data.error || "Upload failed.");
          applyPayload(data);
          uploaded += 1;
        } catch (err) {
          failed.push(item);
          failures.push(`${item.file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
        }
      }
      setPending(failed);
      if (uploaded) setNotice(`${uploaded} document${uploaded === 1 ? "" : "s"} assigned to ${current.name}. You can upload more now.`);
      if (failures.length) setError(failures.join(" "));
      if (uploaded) await loadDocuments();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeDocument(documentItem: ClientDocumentSummary) {
    const current = clientRef.current;
    if (!current || busy || !window.confirm(`Remove “${documentItem.title}” from ${current.name}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/client-documents?phone=${encodeURIComponent(current.phone)}&documentId=${encodeURIComponent(documentItem.id)}`, { method: "DELETE" });
      const data = await response.json() as DocumentPayload;
      if (!response.ok) throw new Error(data.error || "Unable to remove document.");
      applyPayload(data);
      setNotice(`${documentItem.title} removed.`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove document.");
    } finally { setBusy(false); }
  }

  async function renameDocument(documentItem: ClientDocumentSummary) {
    const current = clientRef.current;
    if (!current || busy) return;
    const title = window.prompt("Document title", documentItem.title)?.trim();
    if (!title || title === documentItem.title) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/client-documents/${documentItem.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: current.phone, title }) });
      const data = await response.json() as { document?: ClientDocumentSummary; error?: string };
      if (!response.ok || !data.document) throw new Error(data.error || "Unable to rename document.");
      const updated = data.document;
      setDocuments((items) => items.map((item) => item.id === updated.id ? updated : item));
      setNotice("Document title updated.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename document.");
    } finally { setBusy(false); }
  }

  async function sendDocument(documentItem: ClientDocumentSummary) {
    const current = clientRef.current;
    if (!current || !lead || busy) return;
    const caption = window.prompt("Optional WhatsApp caption", "")?.trim() || undefined;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/client-documents/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: current.phone, documentId: documentItem.id, sender: activeSender(activePanel()), caption }) });
      const data = await response.json() as DocumentPayload & { delivery?: { status?: string } };
      if (!response.ok) throw new Error(data.error || "Unable to send document.");
      applyPayload(data);
      setNotice(data.delivery?.status === "accepted" ? `${documentItem.title} accepted by Meta for delivery.` : `${documentItem.title} added to the simulator.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send document.");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("clientDocumentsModalOpen");
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("clientDocumentsModalOpen"); document.removeEventListener("keydown", onKey); };
  }, [busy, open]);

  const sortedDocuments = useMemo(() => [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [documents]);
  const canManualSend = Boolean(lead?.aiPaused && (lead.source !== "whatsapp" || replyWindow.open));
  const usagePercent = Math.min(100, Math.round((usage.totalBytes / Math.max(1, usage.maxTotalBytes)) * 100));

  const attachControl = attachHost ? createPortal(<button type="button" className="clientDocumentAttachButton" disabled={!client} onClick={openManager} aria-label="Client documents" title="Client documents"><span aria-hidden="true">📎</span>{documents.length ? <b>{documents.length > 9 ? "9+" : documents.length}</b> : null}</button>, attachHost) : null;
  const toolsControl = toolsHost ? createPortal(<button type="button" className="clientDocumentsToolsUpload" disabled={!client} onClick={openManager}><span aria-hidden="true">📎</span> Documents{documents.length ? ` (${documents.length})` : ""}</button>, toolsHost) : null;

  const manager = open && client ? createPortal(
    <div className="clientDocumentsModal" role="dialog" aria-modal="true" aria-label={`Documents for ${client.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className="clientDocumentsDialog">
        <header className="clientDocumentsHeader"><div><span className="clientDocumentsEyebrow">Client-specific files</span><h2>Documents for {client.name}</h2><p>{client.phone} · Upload repeatedly or select several files at once.</p></div><button type="button" className="clientDocumentsClose" disabled={busy} onClick={() => setOpen(false)} aria-label="Close">×</button></header>
        <div className="clientDocumentsStatusBar"><div><strong>{usage.count}/{usage.maxCount}</strong><span>files</span></div><div><strong>{formatSize(usage.totalBytes)}</strong><span>of {formatSize(usage.maxTotalBytes)}</span></div><div className={`clientDocumentsMode ${canManualSend ? "ready" : "guarded"}`}><strong>{lead?.aiPaused ? "Human mode" : "Mary active"}</strong><span>{lead?.aiPaused ? (canManualSend ? "Manual sending available" : "Reply window closed") : "Mary can send assigned files"}</span></div></div>
        <div className="clientDocumentsUsageTrack"><span style={{ width: `${usagePercent}%` }} /></div>
        {notice ? <div className="clientDocumentNotice" role="status">✓ {notice}</div> : null}
        {error ? <div className="clientDocumentError" role="alert">{error}</div> : null}
        <div className="clientDocumentsContent">
          <section className="clientDocumentsUploadCard">
            <div className={`clientDocumentsDropZone ${dragActive ? "dragActive" : ""}`} onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragActive(false); addFiles(Array.from(e.dataTransfer.files || [])); }}>
              <div className="clientDocumentsDropIcon" aria-hidden="true">＋</div><div><strong>Upload documents</strong><p>Select one or many files. After upload, choose more without refreshing.</p><small>PDF, Word, Excel, PowerPoint, TXT or CSV · up to {formatSize(maxBytes)} each</small></div><button type="button" className="clientDocumentsChooseButton" disabled={busy || usage.count + pending.length >= usage.maxCount} onClick={openPicker}>{pending.length ? "Add more files" : "Choose files"}</button>
            </div>
            {pending.map((item) => <div className="clientDocumentsSelectedFile" key={item.key}><span className={`clientDocumentType type-${fileKind(item.file.name).toLowerCase()}`}>{fileKind(item.file.name)}</span><div className="clientDocumentsSelectedMeta"><strong>{item.file.name}</strong><span>{formatSize(item.file.size)}</span><label>Display title<input value={item.title} maxLength={180} onChange={(e) => setPending((items) => items.map((row) => row.key === item.key ? { ...row, title: e.target.value } : row))} /></label></div><div className="clientDocumentsSelectedActions"><button type="button" className="button buttonGhost" disabled={busy} onClick={() => setPending((items) => items.filter((row) => row.key !== item.key))}>Remove</button></div></div>)}
            {pending.length ? <div className="clientDocumentsSelectedActions" style={{ marginTop: 10 }}><button type="button" className="button buttonPrimary" disabled={busy || pending.some((item) => !item.title.trim())} onClick={() => void uploadPending()}>{busy ? "Uploading..." : `Upload ${pending.length} file${pending.length === 1 ? "" : "s"}`}</button><button type="button" className="button buttonGhost" disabled={busy} onClick={() => setPending([])}>Clear queue</button></div> : null}
          </section>
          <section className="clientDocumentsLibrary"><div className="clientDocumentsLibraryHeader"><div><h3>Assigned documents</h3><p>Mary can access only these files for this client.</p></div><button type="button" className="clientDocumentsRefresh" disabled={loading || busy} onClick={() => void loadDocuments()}>{loading ? "Loading..." : "Refresh"}</button></div>{loading && !documents.length ? <div className="clientDocumentsEmpty"><span>⌛</span><strong>Loading documents...</strong></div> : null}{!loading && !documents.length ? <div className="clientDocumentsEmpty"><span>📄</span><strong>No documents assigned yet</strong><p>Choose files on the left to assign them to this client.</p></div> : null}<div className="clientDocumentsList">{sortedDocuments.map((doc) => <article className="clientDocumentItem" key={doc.id}><span className={`clientDocumentType type-${fileKind(doc.fileName).toLowerCase()}`}>{fileKind(doc.fileName)}</span><div className="clientDocumentMeta"><div className="clientDocumentTitleRow"><strong>{doc.title}</strong>{doc.sendCount ? <span className="clientDocumentSentPill">Sent {doc.sendCount}×</span> : <span className="clientDocumentUnsentPill">Not sent</span>}</div><span>{doc.fileName} · {formatSize(doc.sizeBytes)}</span><small>Assigned {friendlyDate(doc.createdAt)}{doc.uploadedBy ? ` by ${doc.uploadedBy}` : ""}</small>{doc.lastSentAt ? <small className="clientDocumentLastSent">Last sent {friendlyDate(doc.lastSentAt)}{doc.lastSentBy ? ` by ${doc.lastSentBy}` : ""}</small> : null}</div><div className="clientDocumentActions"><a href={`/api/admin/client-documents/${doc.id}?phone=${encodeURIComponent(client.phone)}`} target="_blank" rel="noreferrer">Open</a><button type="button" disabled={busy} onClick={() => void renameDocument(doc)}>Rename</button><button type="button" className="send" disabled={busy || !canManualSend} onClick={() => void sendDocument(doc)}>Send</button><button type="button" className="danger" disabled={busy} onClick={() => void removeDocument(doc)}>Remove</button></div></article>)}</div></section>
        </div>
        <footer className="clientDocumentsFooter"><span>Documents load only when this manager is opened, keeping the conversation fast.</span><button type="button" className="button buttonGhost" disabled={busy} onClick={() => setOpen(false)}>Done</button></footer>
      </section>
    </div>, document.body
  ) : null;

  return <><input ref={inputRef} className="clientDocumentFileInput" type="file" accept={ACCEPTED} multiple onChange={(event) => { const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = ""; addFiles(files); }} />{attachControl}{toolsControl}{manager}</>;
}
