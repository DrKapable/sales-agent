"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./medminds-content-studio.module.css";

type Status = "DRAFT" | "REVIEW" | "APPROVED";
type Template = "promo-clean" | "education-card" | "faq-notice";
type Post = {
  id: string;
  title: string;
  contentType: string;
  objective: string | null;
  audience: string | null;
  body: string;
  mediaUrl: string | null;
  status: Status;
  approvedBy: string | null;
  creativeTemplate: Template;
  creativeVisualMode: "graphic" | "photo";
  creativeHeadline: string | null;
  creativeSupportingText: string | null;
  creativeCta: string | null;
  creativeVersion: number;
  photoScene: string | null;
  photoSubject: string | null;
  photoSetting: string | null;
  photoMood: string | null;
  photoStyle: string | null;
  photoVersion: number;
  createdAt: string;
  updatedAt: string;
  previewUrl?: string | null;
  photoUrl?: string | null;
  hasRealisticPhoto?: boolean;
};

type FormState = {
  id: string;
  title: string;
  contentType: string;
  objective: string;
  audience: string;
  tone: string;
  angle: string;
  length: string;
  cta: string;
  notes: string;
  body: string;
};

type CreativeState = { template: Template; headline: string; supportingText: string; cta: string };
type PhotoState = { scene: string; subject: string; setting: string; mood: string; style: string; extraDirection: string };

const defaultVoice = "Credible, practical, academically grounded, warm and concise. Sound like an experienced MedMinds educator and research-support professional. Use clear Zambian English where appropriate, avoid hype, and make every post useful before it becomes promotional.";
const defaultAudience = "Medical students, nurses, postgraduate students, health professionals and researchers in Zambia and beyond";

const contentTypes = [
  "Research education",
  "Research service promotion",
  "Data analysis",
  "Pa Gym / exam preparation",
  "Course promotion",
  "Clinical learning tip",
  "Student FAQ",
  "Academic writing support",
  "Digital health / software",
  "Announcement",
  "Engagement post",
  "Trust building"
];

const quickBriefs = [
  { title: "Research Tip", contentType: "Research education", objective: "Teach one practical research-methods concept that a postgraduate student can apply immediately." },
  { title: "Pa Gym", contentType: "Pa Gym / exam preparation", objective: "Promote MedMinds Prep by showing how structured question practice and OSCE preparation can support exam revision without promising a pass." },
  { title: "Data Analysis", contentType: "Data analysis", objective: "Explain a common data-analysis problem and show when a researcher may need MedMinds support." },
  { title: "Course Spotlight", contentType: "Course promotion", objective: "Introduce one active MedMinds course, who it is for, what it teaches and a simple next step." },
  { title: "FAQ", contentType: "Student FAQ", objective: "Answer one common question a student or researcher asks before using MedMinds services." }
];

const emptyForm: FormState = {
  id: "",
  title: "",
  contentType: "Research education",
  objective: "",
  audience: defaultAudience,
  tone: "professional",
  angle: "auto",
  length: "medium",
  cta: "message",
  notes: "",
  body: ""
};
const emptyCreative: CreativeState = { template: "education-card", headline: "", supportingText: "", cta: "Message MedMinds" };
const emptyPhoto: PhotoState = { scene: "research-work", subject: "woman", setting: "modern-office", mood: "focused", style: "editorial", extraDirection: "" };

function ctaLabel(value: string) {
  if (value === "learn") return "Learn with MedMinds";
  if (value === "enrol") return "Enrol with MedMinds";
  if (value === "try") return "Try MedMinds Prep";
  if (value === "book") return "Book a consultation";
  if (value === "comment") return "Join the conversation";
  if (value === "none") return "Learn more";
  return "Message MedMinds";
}

function supportFromBody(body: string) {
  const clean = body.replace(/#[A-Za-z0-9_]+/g, "").replace(/\s+/g, " ").trim();
  return clean.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2).join(" ").slice(0, 210);
}

export function MedMindsContentStudio() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [creative, setCreative] = useState<CreativeState>(emptyCreative);
  const [photo, setPhoto] = useState<PhotoState>(emptyPhoto);
  const [brandVoice, setBrandVoice] = useState(defaultVoice);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [imageBrief, setImageBrief] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/content", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load Content Studio.");
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Content Studio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const saved = window.localStorage.getItem("medminds-content-brand-voice");
    if (saved) setBrandVoice(saved);
  }, []);
  useEffect(() => { window.localStorage.setItem("medminds-content-brand-voice", brandVoice); }, [brandVoice]);

  const visiblePosts = useMemo(() => posts.filter((post) => filter === "ALL" || post.status === filter), [posts, filter]);
  const counts = useMemo(() => ({ draft: posts.filter((post) => post.status === "DRAFT").length, review: posts.filter((post) => post.status === "REVIEW").length, approved: posts.filter((post) => post.status === "APPROVED").length }), [posts]);
  const liveHeadline = creative.headline.trim() || form.title.trim() || "MedMinds";
  const liveSupport = creative.supportingText.trim() || supportFromBody(form.body) || "Medical learning, research support and practical digital tools for students and professionals.";
  const liveCta = creative.cta.trim() || ctaLabel(form.cta);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function reset() {
    setForm(emptyForm);
    setCreative(emptyCreative);
    setPhoto(emptyPhoto);
    setAlternatives([]);
    setImageBrief("");
    setPreviewUrl("");
    setNotice("");
    setError("");
  }

  async function generate(action: "generate" | "humanise" | "strengthen-hook" | "shorten" = "generate") {
    if (action === "generate" && !form.objective.trim()) { setError("Add a clear objective first."); return; }
    if (action !== "generate" && !form.body.trim()) { setError("Generate or write a caption first."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, brandVoice, existingBody: form.body, action, variationCount: action === "generate" ? 3 : 1 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate content.");
      const options = Array.isArray(data.alternatives) && data.alternatives.length ? data.alternatives : [data.body].filter(Boolean);
      setAlternatives(options);
      update("body", options[0] || "");
      setImageBrief(data.imageBrief || "");
      if (!form.title.trim() && data.headline) update("title", String(data.headline).slice(0, 120));
      setCreative((current) => ({ ...current, headline: String(data.headline || current.headline).slice(0, 100), cta: ctaLabel(form.cta) }));
      setPreviewUrl("");
      setNotice(`${options.length} caption option${options.length === 1 ? "" : "s"} created. Review the facts and wording before approval.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate content.");
    } finally { setBusy(false); }
  }

  async function save(status: Status = "DRAFT") {
    if (!form.title.trim() || !form.body.trim()) { setError("A working title and caption are required."); return null; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: form.id || undefined, title: form.title, contentType: form.contentType, objective: form.objective || null, audience: form.audience || null, body: form.body, status, approvedBy: status === "APPROVED" ? "MedMinds Admin" : null })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save content.");
      setForm((current) => ({ ...current, id: data.id }));
      if (data.previewUrl) setPreviewUrl(data.previewUrl);
      await load();
      setNotice(status === "APPROVED" ? "Content approved." : status === "REVIEW" ? "Content moved to review." : "Draft saved.");
      return data as Post;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save content.");
      return null;
    } finally { setBusy(false); }
  }

  async function generateGraphic() {
    if (!form.body.trim() || !form.title.trim()) { setError("Create the caption and working title first."); return; }
    setImageBusy(true); setError(""); setNotice("");
    try {
      const saved = await save("DRAFT");
      if (!saved) return;
      const response = await fetch(`/api/admin/content/${saved.id}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: creative.template, headline: liveHeadline, supportingText: liveSupport, cta: liveCta })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate branded graphic.");
      setCreative({ template: data.creativeTemplate || creative.template, headline: data.creativeHeadline || liveHeadline, supportingText: data.creativeSupportingText || liveSupport, cta: data.creativeCta || liveCta });
      setPreviewUrl(data.previewUrl || `/api/content/creative/${saved.id}?v=${data.creativeVersion || Date.now()}`);
      await load();
      setNotice("MedMinds branded graphic generated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate branded graphic.");
    } finally { setImageBusy(false); }
  }

  async function generatePhoto() {
    if (!form.body.trim() || !form.title.trim()) { setError("Create the caption and working title first."); return; }
    setImageBusy(true); setError(""); setNotice("");
    try {
      const saved = await save("DRAFT");
      if (!saved) return;
      const response = await fetch(`/api/admin/content/${saved.id}/generate-realistic-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...photo, extraDirection: photo.extraDirection || imageBrief, headline: liveHeadline, supportingText: liveSupport, cta: liveCta })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate realistic image.");
      setPreviewUrl(data.previewUrl || `/api/content/creative/${saved.id}?v=${data.creativeVersion || Date.now()}`);
      await load();
      setNotice("Realistic MedMinds campaign image generated with the branded overlay.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate realistic image.");
    } finally { setImageBusy(false); }
  }

  function edit(post: Post) {
    setForm({ ...emptyForm, id: post.id, title: post.title, contentType: post.contentType, objective: post.objective || "", audience: post.audience || defaultAudience, body: post.body });
    setCreative({ template: post.creativeTemplate || "promo-clean", headline: post.creativeHeadline || post.title, supportingText: post.creativeSupportingText || "", cta: post.creativeCta || "Message MedMinds" });
    setPhoto({ ...emptyPhoto, scene: post.photoScene || emptyPhoto.scene, subject: post.photoSubject || emptyPhoto.subject, setting: post.photoSetting || emptyPhoto.setting, mood: post.photoMood || emptyPhoto.mood, style: post.photoStyle || emptyPhoto.style });
    setAlternatives([post.body]);
    setPreviewUrl(post.mediaUrl ? `/api/content/creative/${post.id}?v=${post.creativeVersion}` : "");
    setImageBrief("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(post: Post) {
    if (!window.confirm(`Delete “${post.title}”?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/content/${post.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete this post.");
      if (form.id === post.id) reset();
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to delete post."); }
    finally { setBusy(false); }
  }

  async function copyCaption() {
    if (!form.body) return;
    await navigator.clipboard.writeText(form.body);
    setNotice("Caption copied.");
  }

  return <main className={styles.page}>
    <header className={styles.hero}>
      <div>
        <Link className={styles.back} href="/admin">← Sales Agent dashboard</Link>
        <span className={styles.eyebrow}>MedMinds marketing workspace</span>
        <h1>Content Studio</h1>
        <p>Create credible MedMinds social content, generate branded graphics or realistic campaign images, and keep approved drafts in one workspace.</p>
      </div>
      <div className={styles.heroStats}>
        <div><span>Drafts</span><strong>{counts.draft}</strong></div>
        <div><span>Review</span><strong>{counts.review}</strong></div>
        <div><span>Approved</span><strong>{counts.approved}</strong></div>
      </div>
    </header>

    {(error || notice) && <div className={error ? styles.error : styles.notice}>{error || notice}</div>}

    <section className={styles.workspace}>
      <div className={styles.editor}>
        <div className={styles.sectionHeading}><div><span>01</span><h2>Content brief</h2></div><button className={styles.textButton} onClick={reset} disabled={busy || imageBusy}>New post</button></div>

        <div className={styles.quickBriefs}>{quickBriefs.map((item) => <button key={item.title} onClick={() => setForm((current) => ({ ...current, title: item.title, contentType: item.contentType, objective: item.objective }))}>{item.title}</button>)}</div>

        <div className={styles.formGrid}>
          <label className={styles.full}>Objective<textarea value={form.objective} onChange={(event) => update("objective", event.target.value)} placeholder="What should this post achieve?" /></label>
          <label>Content type<select value={form.contentType} onChange={(event) => update("contentType", event.target.value)}>{contentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Tone<select value={form.tone} onChange={(event) => update("tone", event.target.value)}><option>professional</option><option>friendly</option><option>educational</option><option>conversational</option><option>authoritative</option><option>community</option><option>urgent</option></select></label>
          <label>Angle<select value={form.angle} onChange={(event) => update("angle", event.target.value)}><option value="auto">Auto</option><option value="direct">Direct</option><option value="story">Story</option><option value="problem-solution">Problem → solution</option><option value="myth-fact">Myth vs fact</option><option value="checklist">Checklist</option><option value="faq">FAQ</option><option value="educational">Educational</option><option value="community">Community</option></select></label>
          <label>Length<select value={form.length} onChange={(event) => update("length", event.target.value)}><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></label>
          <label>Call to action<select value={form.cta} onChange={(event) => { update("cta", event.target.value); setCreative((current) => ({ ...current, cta: ctaLabel(event.target.value) })); }}><option value="message">Message MedMinds</option><option value="learn">Learn more</option><option value="enrol">Enrol</option><option value="try">Try MedMinds Prep</option><option value="book">Book consultation</option><option value="comment">Comment / engage</option><option value="none">No CTA</option></select></label>
          <label className={styles.full}>Audience<input value={form.audience} onChange={(event) => update("audience", event.target.value)} /></label>
          <label className={styles.full}>Extra instructions<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Optional details, campaign dates, service emphasis, link or constraint." /></label>
          <details className={`${styles.voice} ${styles.full}`}><summary>Brand voice</summary><textarea value={brandVoice} onChange={(event) => setBrandVoice(event.target.value)} /></details>
        </div>
        <button className={styles.primary} onClick={() => void generate()} disabled={busy}>{busy ? "Working…" : "Generate 3 caption options"}</button>

        <div className={styles.sectionHeading}><div><span>02</span><h2>Caption editor</h2></div><button className={styles.textButton} onClick={() => void copyCaption()}>Copy caption</button></div>
        {alternatives.length > 1 && <div className={styles.variations}>{alternatives.map((option, index) => <button key={`${index}-${option.slice(0, 20)}`} className={form.body === option ? styles.activeVariation : ""} onClick={() => update("body", option)}>Option {index + 1}</button>)}</div>}
        <label className={styles.captionLabel}>Working title<input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Internal title / creative headline" /></label>
        <label className={styles.captionLabel}>Caption<textarea className={styles.caption} value={form.body} onChange={(event) => update("body", event.target.value)} placeholder="Generated or manually written caption" /></label>
        <div className={styles.refineRow}><button onClick={() => void generate("humanise")} disabled={busy}>Humanise</button><button onClick={() => void generate("strengthen-hook")} disabled={busy}>Strengthen hook</button><button onClick={() => void generate("shorten")} disabled={busy}>Shorten</button></div>
        <div className={styles.saveRow}><button onClick={() => void save("DRAFT")} disabled={busy}>Save draft</button><button onClick={() => void save("REVIEW")} disabled={busy}>Send to review</button><button className={styles.approve} onClick={() => void save("APPROVED")} disabled={busy}>Approve</button></div>
      </div>

      <aside className={styles.creativePanel}>
        <div className={styles.sectionHeading}><div><span>03</span><h2>Creative generator</h2></div></div>
        <div className={styles.preview}>
          {previewUrl ? <img src={previewUrl} alt="Generated MedMinds social media creative" /> : <div className={styles.previewPlaceholder}><div className={styles.previewMark}>M</div><strong>{liveHeadline}</strong><p>{liveSupport}</p><span>{liveCta}</span></div>}
        </div>

        <div className={styles.creativeFields}>
          <label>Headline<input value={creative.headline} onChange={(event) => setCreative((current) => ({ ...current, headline: event.target.value }))} placeholder={form.title || "Creative headline"} /></label>
          <label>Supporting text<textarea value={creative.supportingText} onChange={(event) => setCreative((current) => ({ ...current, supportingText: event.target.value }))} placeholder={supportFromBody(form.body) || "Supporting line"} /></label>
          <label>CTA<input value={creative.cta} onChange={(event) => setCreative((current) => ({ ...current, cta: event.target.value }))} /></label>
          <label>Graphic template<select value={creative.template} onChange={(event) => setCreative((current) => ({ ...current, template: event.target.value as Template }))}><option value="promo-clean">Promotion</option><option value="education-card">Educational card</option><option value="faq-notice">FAQ / notice</option></select></label>
        </div>
        <button className={styles.primary} onClick={() => void generateGraphic()} disabled={imageBusy || busy}>{imageBusy ? "Generating…" : "Generate branded graphic"}</button>

        <div className={styles.photoBox}>
          <div><span className={styles.micro}>AI photography</span><h3>Realistic MedMinds image</h3><p>Generate a fictional, privacy-safe African medical, research or student scene and apply the MedMinds overlay.</p></div>
          <div className={styles.photoGrid}>
            <label>Scene<select value={photo.scene} onChange={(event) => setPhoto((current) => ({ ...current, scene: event.target.value }))}><option value="research-work">Research work</option><option value="clinical-learning">Clinical learning</option><option value="student-study">Student study</option><option value="data-analysis">Data analysis</option><option value="teaching">Teaching</option><option value="digital-health">Digital health</option><option value="neutral-portrait">Portrait</option></select></label>
            <label>Subject<select value={photo.subject} onChange={(event) => setPhoto((current) => ({ ...current, subject: event.target.value }))}><option value="woman">Woman</option><option value="man">Man</option><option value="mixed-pair">Mixed pair</option><option value="small-group">Small group</option><option value="clinician">Clinician</option><option value="student">Student</option></select></label>
            <label>Setting<select value={photo.setting} onChange={(event) => setPhoto((current) => ({ ...current, setting: event.target.value }))}><option value="modern-office">Modern office</option><option value="university">University</option><option value="clinical-classroom">Clinical classroom</option><option value="library">Library</option><option value="workspace">Workspace</option><option value="urban-outdoor">Urban outdoor</option></select></label>
            <label>Mood<select value={photo.mood} onChange={(event) => setPhoto((current) => ({ ...current, mood: event.target.value }))}><option value="focused">Focused</option><option value="confident">Confident</option><option value="approachable">Approachable</option><option value="curious">Curious</option><option value="warm">Warm</option></select></label>
            <label>Style<select value={photo.style} onChange={(event) => setPhoto((current) => ({ ...current, style: event.target.value }))}><option value="editorial">Editorial</option><option value="lifestyle">Lifestyle</option><option value="premium">Premium</option><option value="documentary">Documentary</option></select></label>
          </div>
          <label>Custom visual direction<textarea value={photo.extraDirection} onChange={(event) => setPhoto((current) => ({ ...current, extraDirection: event.target.value }))} placeholder={imageBrief || "Optional: describe the exact scene. The generated image brief is used automatically when this is blank."} /></label>
          {imageBrief && <div className={styles.imageBrief}><strong>Suggested visual:</strong> {imageBrief}</div>}
          <button className={styles.photoButton} onClick={() => void generatePhoto()} disabled={imageBusy || busy}>{imageBusy ? "Generating photo…" : "Generate realistic image"}</button>
        </div>
      </aside>
    </section>

    <section className={styles.library}>
      <div className={styles.libraryHeader}><div><span className={styles.eyebrow}>Content library</span><h2>Saved MedMinds content</h2></div><div className={styles.filters}>{(["ALL", "DRAFT", "REVIEW", "APPROVED"] as const).map((item) => <button key={item} className={filter === item ? styles.activeFilter : ""} onClick={() => setFilter(item)}>{item === "ALL" ? "All" : item.toLowerCase()}</button>)}</div></div>
      {loading ? <p className={styles.empty}>Loading content…</p> : visiblePosts.length === 0 ? <p className={styles.empty}>No saved content in this view yet.</p> : <div className={styles.libraryGrid}>{visiblePosts.map((post) => <article key={post.id}>
        <div className={styles.postTop}><span>{post.contentType}</span><b className={`${styles.status} ${styles[post.status.toLowerCase()]}`}>{post.status}</b></div>
        {post.mediaUrl && <img src={`/api/content/creative/${post.id}?v=${post.creativeVersion}`} alt="" />}
        <h3>{post.title}</h3><p>{post.body.slice(0, 220)}{post.body.length > 220 ? "…" : ""}</p>
        <small>Updated {new Date(post.updatedAt).toLocaleString()}</small>
        <div className={styles.postActions}><button onClick={() => edit(post)}>Edit</button><button className={styles.delete} onClick={() => void remove(post)}>Delete</button></div>
      </article>)}</div>}
    </section>
  </main>;
}
