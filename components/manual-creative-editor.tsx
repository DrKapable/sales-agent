"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./manual-creative-editor.module.css";

type Template = "promo-clean" | "education-card" | "faq-notice";
type LayoutVariant = "auto" | "spotlight" | "split" | "cards" | "editorial" | "data-grid" | "faq";
type Post = {
  id: string; title: string; contentType: string; creativeTemplate: Template; creativeVisualMode: "graphic" | "photo";
  creativeHeadline: string | null; creativeSupportingText: string | null; creativeCta: string | null; creativeCtaHidden: boolean;
  creativeVersion: number; mediaUrl: string | null; photoGeneratedAt: string | null; photoVersion: number;
};
type Settings = {
  textScale: number; supportLines: number; photoX: number; photoY: number; photoZoom: number;
  cardOpacity: number; logoPosition: "left" | "center"; textAlign: "left" | "center"; showWebsite: boolean;
  layoutVariant: LayoutVariant;
};

type EditorSnapshot = {
  settings: Settings; headline: string; support: string; cta: string; hideCta: boolean; template: Template;
};

const defaults: Settings = { textScale: 1, supportLines: 3, photoX: 74, photoY: 50, photoZoom: 1, cardOpacity: .94, logoPosition: "left", textAlign: "left", showWebsite: true, layoutVariant: "auto" };
const layoutOptions: Array<{ value: LayoutVariant; label: string }> = [
  { value: "auto", label: "Auto — match the content" },
  { value: "spotlight", label: "Spotlight" },
  { value: "split", label: "Split feature" },
  { value: "cards", label: "Benefit cards" },
  { value: "editorial", label: "Editorial" },
  { value: "data-grid", label: "Data / digital" },
  { value: "faq", label: "FAQ" }
];

function sameSnapshot(a: EditorSnapshot | null, b: EditorSnapshot) {
  return Boolean(a) && JSON.stringify(a) === JSON.stringify(b);
}

function fieldsMessage(fields: unknown) {
  if (!fields || typeof fields !== "object") return "";
  const entries = Object.entries(fields as Record<string, unknown>).flatMap(([key, value]) => Array.isArray(value) ? value.map((item) => `${key}: ${String(item)}`) : []);
  return entries.join(" · ");
}

export function ManualCreativeEditor({ postId }: { postId: string }) {
  const [post,setPost]=useState<Post|null>(null);
  const [settings,setSettings]=useState<Settings>(defaults);
  const [headline,setHeadline]=useState("");
  const [support,setSupport]=useState("");
  const [cta,setCta]=useState("");
  const [hideCta,setHideCta]=useState(false);
  const [template,setTemplate]=useState<Template>("promo-clean");
  const [savedSnapshot,setSavedSnapshot]=useState<EditorSnapshot|null>(null);
  const [preview,setPreview]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  function snapshot(nextSettings=settings,nextHeadline=headline,nextSupport=support,nextCta=cta,nextHideCta=hideCta,nextTemplate=template):EditorSnapshot {
    return { settings: nextSettings, headline: nextHeadline, support: nextSupport, cta: nextCta, hideCta: nextHideCta, template: nextTemplate };
  }

  async function load(){
    setLoading(true);
    try{
      const r=await fetch(`/api/admin/content/${postId}/creative-settings`,{cache:"no-store"});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Unable to load creative editor.");
      const loadedSettings={...defaults,...(d.settings||{})} as Settings;
      const loadedHeadline=d.post.creativeHeadline||d.post.title||"";
      const loadedSupport=d.post.creativeSupportingText||"";
      const loadedHideCta=Boolean(d.post.creativeCtaHidden);
      const loadedCta=loadedHideCta?"":d.post.creativeCta||"Message MedMinds";
      const loadedTemplate=(d.post.creativeTemplate||"promo-clean") as Template;
      setPost(d.post); setSettings(loadedSettings); setHeadline(loadedHeadline); setSupport(loadedSupport); setCta(loadedCta); setHideCta(loadedHideCta); setTemplate(loadedTemplate);
      setSavedSnapshot({settings:loadedSettings,headline:loadedHeadline,support:loadedSupport,cta:loadedCta,hideCta:loadedHideCta,template:loadedTemplate});
      setPreview(`${d.previewUrl}&editor=${Date.now()}`); setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load creative editor.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[postId]);

  const currentSnapshot=useMemo(()=>({settings,headline,support,cta,hideCta,template}),[settings,headline,support,cta,hideCta,template]);
  const dirty=!sameSnapshot(savedSnapshot,currentSnapshot);

  const livePreviewUrl=useMemo(()=>{
    if(!post)return "";
    const p=new URLSearchParams({
      editorPreview:"1",
      t:String(Date.now()),
      headline,
      supportingText:support,
      cta,
      hideCta:hideCta?"1":"0",
      template,
      layoutVariant:settings.layoutVariant,
      textScale:String(settings.textScale),
      supportLines:String(settings.supportLines),
      photoX:String(settings.photoX),
      photoY:String(settings.photoY),
      photoZoom:String(settings.photoZoom),
      cardOpacity:String(settings.cardOpacity),
      logoPosition:settings.logoPosition,
      textAlign:settings.textAlign,
      showWebsite:settings.showWebsite?"1":"0"
    });
    return `/api/content/creative/${post.id}?${p.toString()}`;
  },[post,headline,support,cta,hideCta,template,settings]);

  useEffect(()=>{
    if(!livePreviewUrl)return;
    const timer=window.setTimeout(()=>setPreview(livePreviewUrl),220);
    return()=>window.clearTimeout(timer);
  },[livePreviewUrl]);

  function patch<K extends keyof Settings>(key:K,value:Settings[K]){setSettings(v=>({...v,[key]:value}));setNotice("");}
  async function save(){
    setSaving(true);setError("");setNotice("");
    try{
      const r=await fetch(`/api/admin/content/${postId}/creative-settings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...settings,template,headline,supportingText:support,cta:hideCta?"":cta,hideCta})});
      const d=await r.json(); if(!r.ok) throw new Error([d.error,fieldsMessage(d.fields)].filter(Boolean).join(" — ")||"Unable to save image edits.");
      const nextSettings={...defaults,...d.settings} as Settings;
      setPost(d.post); setSettings(nextSettings);
      const nextSnapshot={settings:nextSettings,headline,support,cta,hideCta,template};
      setSavedSnapshot(nextSnapshot);
      setPreview(`${d.previewUrl}&editor=${Date.now()}`);
      setNotice("Saved. This exact creative version will be used for future Facebook scheduling and posting.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to save image edits.");}
    finally{setSaving(false);}
  }
  function reset(){
    if(!savedSnapshot)return;
    setSettings(savedSnapshot.settings);setHeadline(savedSnapshot.headline);setSupport(savedSnapshot.support);setCta(savedSnapshot.cta);setHideCta(savedSnapshot.hideCta);setTemplate(savedSnapshot.template);setError("");setNotice("Unsaved edits reset to the last saved version.");
  }

  if(loading)return <main className={styles.page}><div className={styles.loading}>Loading image editor…</div></main>;
  if(!post)return <main className={styles.page}><div className={styles.loading}>{error||"Creative not found."}</div></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div><Link href="/admin/content">← Content Studio</Link><span>Manual creative editor</span><h1>{post.title}</h1><p>Adjust this post with a live preview. Nothing changes until you press <strong>Save final image edits</strong>.</p></div><div className={styles.headerActions}><Link href="/admin/social">Scheduler</Link><Link className={styles.canvaLink} href={`/admin/content/${postId}/canva`}>Canva</Link></div></header>
    {(error||notice)&&<div className={error?styles.error:styles.notice}>{error||notice}</div>}
    <div className={styles.workspace}>
      <section className={styles.previewPanel}>
        <div className={styles.previewTop}><div><strong>Live preview</strong><span>{dirty?"Unsaved changes":"Saved version"}</span></div><span className={dirty?styles.unsavedBadge:styles.savedBadge}>{dirty?"Editing":"Saved"}</span></div>
        <div className={styles.previewFrame}><img key={preview} src={preview||`/api/content/creative/${postId}?v=${post.creativeVersion||1}`} alt="Edited MedMinds Facebook creative" /></div>
        <div className={styles.previewMeta}><strong>Facebook square · 1080 × 1080</strong><span>{post.creativeVisualMode==="photo"?"Photo + branded overlay":"Branded graphic"}</span></div>
      </section>
      <section className={styles.controls}>
        <div className={styles.block}><div className={styles.blockHeading}><div><h2>Layout</h2><p>Auto varies the design according to the content. Choose a layout to override it manually.</p></div></div><label>Creative layout<select value={settings.layoutVariant} onChange={e=>patch("layoutVariant",e.target.value as LayoutVariant)}>{layoutOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Base treatment<select value={template} onChange={e=>setTemplate(e.target.value as Template)}><option value="promo-clean">Promotion</option><option value="education-card">Educational</option><option value="faq-notice">FAQ / notice</option></select></label></div>
        <div className={styles.block}><h2>Text</h2><label>Headline <span>{headline.length}/120</span><input value={headline} maxLength={120} onChange={e=>{setHeadline(e.target.value);setNotice("");}}/></label><label>Supporting text <span>{support.length}/320</span><textarea value={support} maxLength={320} onChange={e=>{setSupport(e.target.value);setNotice("");}}/></label><label className={styles.checkbox}><input type="checkbox" checked={hideCta} onChange={e=>{setHideCta(e.target.checked);setNotice("");}}/> No CTA on this creative</label>{!hideCta&&<label>CTA<input value={cta} maxLength={60} onChange={e=>{setCta(e.target.value);setNotice("");}}/></label>}</div>
        <div className={styles.block}><h2>Typography & density</h2><label>Text size <b>{Math.round(settings.textScale*100)}%</b><input type="range" min="0.75" max="1.25" step="0.05" value={settings.textScale} onChange={e=>patch("textScale",Number(e.target.value))}/></label><label>Benefit lines<select value={settings.supportLines} onChange={e=>patch("supportLines",Number(e.target.value))}><option value={0}>None</option><option value={1}>1 line</option><option value={2}>2 lines</option><option value={3}>3 lines</option></select></label><label>Text alignment<select value={settings.textAlign} onChange={e=>patch("textAlign",e.target.value as Settings["textAlign"])}><option value="left">Left</option><option value="center">Centre</option></select></label><label>Logo position<select value={settings.logoPosition} onChange={e=>patch("logoPosition",e.target.value as Settings["logoPosition"])}><option value="left">Top left</option><option value="center">Top centre</option></select></label><label className={styles.checkbox}><input type="checkbox" checked={settings.showWebsite} onChange={e=>patch("showWebsite",e.target.checked)}/> Show website / footer label</label></div>
        {post.creativeVisualMode==="photo"&&<div className={styles.block}><h2>Photo framing</h2><p className={styles.blockNote}>These controls update the preview while you drag them.</p><label>Horizontal focus <b>{settings.photoX}%</b><input type="range" min="0" max="100" value={settings.photoX} onChange={e=>patch("photoX",Number(e.target.value))}/></label><label>Vertical focus <b>{settings.photoY}%</b><input type="range" min="0" max="100" value={settings.photoY} onChange={e=>patch("photoY",Number(e.target.value))}/></label><label>Zoom <b>{settings.photoZoom.toFixed(2)}×</b><input type="range" min="1" max="1.45" step="0.05" value={settings.photoZoom} onChange={e=>patch("photoZoom",Number(e.target.value))}/></label><label>Text-card opacity <b>{Math.round(settings.cardOpacity*100)}%</b><input type="range" min="0.72" max="1" step="0.02" value={settings.cardOpacity} onChange={e=>patch("cardOpacity",Number(e.target.value))}/></label></div>}
        <div className={styles.actions}><button onClick={reset} disabled={saving||!dirty}>Undo unsaved changes</button><button className={styles.primary} onClick={()=>void save()} disabled={saving||!dirty}>{saving?"Saving…":"Save final image edits"}</button></div>
        <p className={styles.help}>After saving, future schedules and “Post now” use this saved version. Existing frozen Facebook publications are intentionally not changed.</p>
      </section>
    </div>
  </div></main>;
}
