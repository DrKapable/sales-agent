"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./content-studio-visual-drawer.module.css";

type Category = "screenshot" | "testimonial" | "student-photo" | "team-photo" | "campaign";
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
type Asset = {
  id: string;
  title: string;
  category: Category;
  fileName: string;
  mimeType: string;
  altText: string | null;
  tags: string[];
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  imageUrl: string;
};
type Props = {
  activePostId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showLauncher?: boolean;
};

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
const categoryOptions: Array<{ value: Category; label: string }> = [
  { value: "screenshot", label: "Platform screenshot" },
  { value: "testimonial", label: "Testimonial" },
  { value: "student-photo", label: "Student photo" },
  { value: "team-photo", label: "Team photo" },
  { value: "campaign", label: "Campaign asset" }
];

function categoryLabel(value: Category) {
  return categoryOptions.find((item) => item.value === value)?.label || "Media asset";
}

function sourceLabel(post: Post | null) {
  if (!post?.mediaUrl) return "No visual yet";
  const prompt = String(post.photoPrompt || "");
  if (/^Media library asset:/i.test(prompt)) return "Media library";
  if (/^Uploaded platform screenshot:/i.test(prompt)) return "Uploaded screenshot";
  if (/^Uploaded real photo:/i.test(prompt)) return "Uploaded real photo";
  return "Existing creative";
}

export function ContentStudioVisualDrawer({ activePostId = "", open: controlledOpen, onOpenChange, showLauncher = true }: Props = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback((next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }, [controlledOpen, onOpenChange]);

  const [posts, setPosts] = useState<Post[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [category, setCategory] = useState<Category>("screenshot");
  const [file, setFile] = useState<File | null>(null);
  const [assetTitle, setAssetTitle] = useState("");
  const [assetAlt, setAssetAlt] = useState("");
  const [assetTags, setAssetTags] = useState("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | Category>("ALL");
  const [previewNonce, setPreviewNonce] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => posts.find((post) => post.id === selectedId) || null, [posts, selectedId]);
  const isSensitiveCategory = category === "testimonial" || category === "student-photo";
  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (categoryFilter !== "ALL" && asset.category !== categoryFilter) return false;
      if (!query) return true;
      return [asset.title, asset.fileName, asset.category, ...asset.tags].join(" ").toLowerCase().includes(query);
    });
  }, [assets, categoryFilter, search]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/content", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load saved content.");
      const items = Array.isArray(data.posts) ? data.posts as Post[] : [];
      setPosts(items);
      setSelectedId((current) => {
        if (activePostId && items.some((item) => item.id === activePostId)) return activePostId;
        if (current && items.some((item) => item.id === current)) return current;
        return "";
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load saved content.");
    } finally {
      setLoading(false);
    }
  }, [activePostId]);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const response = await fetch("/api/admin/content/media-library", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load the media library.");
      setAssets(Array.isArray(data.assets) ? data.assets as Asset[] : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load the media library.");
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePostId) setSelectedId(activePostId);
    else setSelectedId("");
  }, [activePostId]);

  useEffect(() => {
    if (open) void Promise.all([loadPosts(), loadLibrary()]);
  }, [open, loadPosts, loadLibrary]);

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
    if (!assetTitle.trim()) setAssetTitle(next.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  }

  async function applyAsset(assetId: string) {
    if (!selectedId) {
      setError("Save this post first, then choose its visual.");
      return false;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/content/${selectedId}/use-library-asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to use this media asset.");
      setPreviewNonce(Date.now());
      await Promise.all([loadPosts(), loadLibrary()]);
      setNotice(`“${data.mediaAsset?.title || "Media asset"}” is now the active visual for ${selected?.title || "this post"}.`);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to use this media asset.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function uploadAsset() {
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    if (isSensitiveCategory && !permissionConfirmed) {
      setError("Confirm that MedMinds has permission to publish this testimonial or student photo.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", category);
      form.append("title", assetTitle);
      form.append("altText", assetAlt);
      form.append("tags", assetTags);
      const response = await fetch("/api/admin/content/media-library", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to add the image to the media library.");

      const newAsset = data.asset as Asset;
      setFile(null);
      setAssetTitle("");
      setAssetAlt("");
      setAssetTags("");
      setPermissionConfirmed(false);
      if (inputRef.current) inputRef.current.value = "";
      await loadLibrary();

      if (selectedId && newAsset?.id) {
        const useResponse = await fetch(`/api/admin/content/${selectedId}/use-library-asset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: newAsset.id })
        });
        const useData = await useResponse.json();
        if (!useResponse.ok) throw new Error(useData.error || "The asset was saved, but could not be applied to this post.");
        setPreviewNonce(Date.now());
        await Promise.all([loadPosts(), loadLibrary()]);
        setNotice(`“${newAsset.title}” was saved and applied to ${selected?.title || "this post"}.`);
      } else {
        setNotice(`“${newAsset.title}” was saved to the MedMinds media library.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add the image to the media library.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAsset(asset: Asset) {
    if (!window.confirm(`Delete “${asset.title}” from the reusable media library? Existing posts will keep their current visual.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/content/media-library?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete this media asset.");
      await loadLibrary();
      setNotice("Media asset removed from the reusable library. Existing post visuals were not changed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete this media asset.");
    } finally {
      setBusy(false);
    }
  }

  const preview = selected?.mediaUrl ? `/api/content/creative/${selected.id}?v=${selected.creativeVersion}&library=${previewNonce}` : "";

  return <>
    {showLauncher && <button className={styles.launcher} onClick={() => setOpen(true)} aria-label="Open MedMinds media library">
      <span>Visuals</span>
      <strong>Media library</strong>
    </button>}

    {open && <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="MedMinds media library">
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Authentic visual workflow</span>
            <h2>Media library</h2>
            <p>Choose the visual for the post you are working on. Reuse approved MedMinds assets first, then Canva, with AI imagery only as a fallback.</p>
          </div>
          <button className={styles.close} onClick={() => setOpen(false)} aria-label="Close media library">×</button>
        </header>

        {(error || notice) && <div className={error ? styles.error : styles.notice}>{error || notice}</div>}

        <div className={styles.priority}>
          <div className={styles.priorityItem}><b>1</b><span><strong>MedMinds media</strong><small>Approved screenshots, testimonials and real photos.</small></span></div>
          <div className={styles.priorityItem}><b>2</b><span><strong>Canva</strong><small>Crop, refine or apply Brand Kit treatment.</small></span></div>
          <div className={`${styles.priorityItem} ${styles.fallback}`}><b>3</b><span><strong>AI fallback</strong><small>Only when no suitable authentic asset exists.</small></span></div>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionTitle}><div><span>01</span><h3>Post</h3></div><button onClick={() => void loadPosts()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
          {activePostId && selected?.id === activePostId && <div className={styles.contextBanner}><span>Current editor post</span><strong>{selected.title}</strong><small>{selected.status.toLowerCase()} · {sourceLabel(selected)}</small></div>}
          {!activePostId && <div className={styles.contextBanner}><span>No saved post selected</span><strong>Save the caption before applying a visual</strong><small>You can still browse or add reusable media.</small></div>}
          {posts.length ? <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setNotice(""); setError(""); }}>
            <option value="">Choose a saved post</option>
            {posts.map((post) => <option key={post.id} value={post.id}>{post.title} · {post.status.toLowerCase()}</option>)}
          </select> : <div className={styles.empty}>No saved content yet. Save a caption in Content Studio, then return here.</div>}
          {selected && selected.id !== activePostId && <div className={styles.selectionWarning}>You selected a different saved post: <strong>{selected.title}</strong>. Visual actions below will affect this post.</div>}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}><div><span>02</span><h3>Reusable assets</h3></div><button onClick={() => void loadLibrary()} disabled={libraryLoading}>{libraryLoading ? "Loading…" : `${assets.length} saved`}</button></div>
          <div className={styles.libraryTools}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, tag or filename" />
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as "ALL" | Category)}>
              <option value="ALL">All asset types</option>
              {categoryOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>

          {libraryLoading && !assets.length ? <div className={styles.empty}>Loading reusable assets…</div> : visibleAssets.length === 0 ? <div className={styles.empty}>No matching assets yet. Add the first approved MedMinds visual below.</div> : <div className={styles.assetGrid}>
            {visibleAssets.map((asset) => <article key={asset.id} className={styles.assetCard}>
              <div className={styles.assetThumb}><img src={asset.imageUrl} alt={asset.altText || asset.title} /></div>
              <div className={styles.assetBody}>
                <span className={styles.assetCategory}>{categoryLabel(asset.category)}</span>
                <strong title={asset.title}>{asset.title}</strong>
                <small>{asset.usageCount} application{asset.usageCount === 1 ? "" : "s"}{asset.tags.length ? ` · ${asset.tags.slice(0, 2).join(", ")}` : ""}</small>
                <div className={styles.assetActions}>
                  <button className={styles.useAsset} onClick={() => void applyAsset(asset.id)} disabled={!selectedId || busy}>Use on selected post</button>
                  <button className={styles.deleteAsset} onClick={() => void deleteAsset(asset)} disabled={busy}>Delete</button>
                </div>
              </div>
            </article>)}
          </div>}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}><div><span>03</span><h3>Add approved asset</h3></div></div>
          <div className={styles.categoryRow}>
            {categoryOptions.map((item) => <button key={item.value} className={category === item.value ? styles.categoryActive : ""} onClick={() => { setCategory(item.value); setPermissionConfirmed(false); }}>{item.label}</button>)}
          </div>

          <div className={styles.assetFields}>
            <label>Asset title<input value={assetTitle} onChange={(event) => setAssetTitle(event.target.value)} placeholder="e.g. MedMinds Prep question screen" /></label>
            <label>Search tags<input value={assetTags} onChange={(event) => setAssetTags(event.target.value)} placeholder="prep, osce, question bank" /></label>
            <label className={styles.fullField}>Alt text<input value={assetAlt} onChange={(event) => setAssetAlt(event.target.value)} placeholder="Short accessible description of the visual" /></label>
          </div>

          {isSensitiveCategory && <label className={styles.permissionCheck}><input type="checkbox" checked={permissionConfirmed} onChange={(event) => setPermissionConfirmed(event.target.checked)} /><span>I confirm MedMinds has permission to publish this {category === "testimonial" ? "testimonial" : "student photo"}.</span></label>}

          <input ref={inputRef} className={styles.hiddenInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
          <button className={styles.dropzone} onClick={() => inputRef.current?.click()} disabled={busy}>
            <span className={styles.uploadIcon}>↑</span>
            <strong>{file ? file.name : "Choose PNG, JPG or WebP"}</strong>
            <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB selected` : "Upload once and reuse. Maximum 8 MB."}</small>
          </button>
          <p className={styles.safetyNote}>Do not store patient information, confidential records, student IDs, private chats without consent, protected examination material or answer keys.</p>
          <button className={styles.uploadButton} onClick={() => void uploadAsset()} disabled={!file || busy || (isSensitiveCategory && !permissionConfirmed)}>{busy ? "Saving…" : selectedId ? "Save & use on selected post" : "Save to media library"}</button>
        </section>

        {selected && <section className={styles.section}>
          <div className={styles.sectionTitle}><div><span>04</span><h3>Preview and refine</h3></div></div>
          {preview ? <div className={styles.preview}><img src={preview} alt={`Current visual for ${selected.title}`} /></div> : <div className={styles.empty}>Choose a library asset or add a new one to preview it here.</div>}
          <div className={styles.actions}>
            <Link className={styles.canva} href={`/admin/content/${selected.id}/canva`}>Refine in Canva</Link>
            <Link href={`/admin/content/${selected.id}/image-editor`}>Manual editor</Link>
          </div>
          <p className={styles.helper}>Applying an asset creates a stable post snapshot, so later library cleanup does not break published or scheduled creatives.</p>
        </section>}
      </aside>
    </div>}
  </>;
}
