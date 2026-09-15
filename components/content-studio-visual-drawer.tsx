"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./content-studio-visual-drawer.module.css";

type VisualKind = "screenshot" | "photo";
type Post = {
  id: string;
  title: string;
  contentType: string;
  status: "DRAFT" | "REVIEW" | "APPROVED";
  mediaUrl: string | null;
  previewUrl?: string | null;
  creativeVersion: number;
  photoPrompt?: string | null;
  updatedAt: string;
};

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);

function sourceLabel(post: Post | null) {
  if (!post?.mediaUrl) return "No visual yet";
  const prompt = String(post.photoPrompt || "");
  if (/^Uploaded platform screenshot:/i.test(prompt)) return "Uploaded screenshot";
  if (/^Uploaded real photo:/i.test(prompt)) return "Uploaded real photo";
  return "Existing creative";
}

export function ContentStudioVisualDrawer() {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [kind, setKind] = useState<VisualKind>("screenshot");
  const [file, setFile] = useState<File | null>(null);
  const [previewNonce, setPreviewNonce] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => posts.find((post) => post.id === selectedId) || null, [posts, selectedId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/content", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load saved content.");
      const items = Array.isArray(data.posts) ? data.posts as Post[] : [];
      setPosts(items);
      setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || "");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load saved content.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function chooseFile(next: File | null) {
    setNotice("");
    setError("");
    if (!next) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.has(next.type)) {
      setFile(null);
      setError("Use a PNG, JPG, JPEG or WebP image.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setFile(null);
      setError("The selected image is larger than 8 MB.");
      return;
    }
    setFile(next);
  }

  async function upload() {
    if (!selectedId) {
      setError("Save the caption as a draft first, then select it here.");
      return;
    }
    if (!file) {
      setError("Choose an image first.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const response = await fetch(`/api/admin/content/${selectedId}/upload-visual`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to upload the visual.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setPreviewNonce(Date.now());
      await load();
      setNotice(kind === "screenshot" ? "Platform screenshot added as the active visual." : "Real photo added as the active visual.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload the visual.");
    } finally {
      setBusy(false);
    }
  }

  const preview = selected?.mediaUrl ? `/api/content/creative/${selected.id}?v=${selected.creativeVersion}&authentic=${previewNonce}` : "";

  return <>
    <button className={styles.launcher} onClick={() => setOpen(true)} aria-label="Open authentic visual tools">
      <span>Visuals</span>
      <strong>Use real assets</strong>
    </button>

    {open && <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Authentic visual tools">
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Marketing review · phase 2</span>
            <h2>Authentic visuals</h2>
            <p>Prefer MedMinds screenshots, approved real photos and Canva assets before generating an artificial scene.</p>
          </div>
          <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close visual tools">×</button>
        </header>

        {(error || notice) && <div className={error ? styles.error : styles.notice}>{error || notice}</div>}

        <div className={styles.priority}>
          <div className={styles.priorityItem}><b>1</b><span><strong>Upload a real asset</strong><small>Best for platform screenshots, student-approved photos and genuine MedMinds activity.</small></span></div>
          <div className={styles.priorityItem}><b>2</b><span><strong>Use Canva</strong><small>Use Brand Kit, existing designs and editorial library assets when a first-party image is unavailable.</small></span></div>
          <div className={`${styles.priorityItem} ${styles.fallback}`}><b>3</b><span><strong>AI image</strong><small>Keep AI photography as the fallback, not the default visual source.</small></span></div>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionTitle}><div><span>01</span><h3>Select saved content</h3></div><button onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
          {posts.length ? <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setFile(null); setNotice(""); setError(""); }}>
            {posts.map((post) => <option key={post.id} value={post.id}>{post.title} · {post.status.toLowerCase()}</option>)}
          </select> : <div className={styles.empty}>No saved content yet. Save your caption as a draft in Content Studio, then return here.</div>}
          {selected && <div className={styles.selectedMeta}><span>{selected.contentType}</span><b>{sourceLabel(selected)}</b></div>}
        </section>

        {selected && <section className={styles.section}>
          <div className={styles.sectionTitle}><div><span>02</span><h3>Upload visual</h3></div></div>
          <div className={styles.kindRow}>
            <button className={kind === "screenshot" ? styles.kindActive : ""} onClick={() => setKind("screenshot")}><strong>Platform screenshot</strong><small>Product UI, questions, dashboards or MedMinds features.</small></button>
            <button className={kind === "photo" ? styles.kindActive : ""} onClick={() => setKind("photo")}><strong>Real photo</strong><small>Approved student, team, class or event photography.</small></button>
          </div>

          <input ref={inputRef} className={styles.hiddenInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
          <button className={styles.dropzone} onClick={() => inputRef.current?.click()} disabled={busy}>
            <span className={styles.uploadIcon}>↑</span>
            <strong>{file ? file.name : "Choose PNG, JPG or WebP"}</strong>
            <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB selected` : "Maximum 8 MB. Square or portrait images work best for social content."}</small>
          </button>
          <p className={styles.safetyNote}>Only upload images MedMinds has permission to use. Do not upload patient information, confidential records, student IDs, protected examination material or answer keys.</p>
          <button className={styles.uploadButton} onClick={() => void upload()} disabled={!file || busy}>{busy ? "Uploading…" : `Use this ${kind === "screenshot" ? "screenshot" : "photo"}`}</button>
        </section>}

        {selected && <section className={styles.section}>
          <div className={styles.sectionTitle}><div><span>03</span><h3>Preview and refine</h3></div></div>
          {preview ? <div className={styles.preview}><img src={preview} alt={`Current visual for ${selected.title}`} /></div> : <div className={styles.empty}>Upload or generate a visual to preview it here.</div>}
          <div className={styles.actions}>
            <Link className={styles.canva} href={`/admin/content/${selected.id}/canva`}>Open in Canva</Link>
            <Link href={`/admin/content/${selected.id}/image-editor`}>Manual editor</Link>
          </div>
          <p className={styles.helper}>Canva is the preferred second step when the authentic asset needs layout, crop or brand treatment. The existing AI image generator remains available in the main Content Studio when no suitable real or Canva asset exists.</p>
        </section>}
      </aside>
    </div>}
  </>;
}
