"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./manual-creative-editor.module.css";

type Template = "promo-clean" | "education-card" | "faq-notice";
type Post = {
  id: string; title: string; creativeTemplate: Template; creativeVisualMode: "graphic" | "photo";
  creativeHeadline: string | null; creativeSupportingText: string | null; creativeCta: string | null;
  creativeVersion: number; mediaUrl: string | null; photoGeneratedAt: string | null;
};
type Settings = {
  textScale: number; supportLines: number; photoX: number; photoY: number; photoZoom: number;
  cardOpacity: number; logoPosition: "left" | "center"; textAlign: "left" | "center"; showWebsite: boolean;
};

const defaults: Settings = { textScale: 1, supportLines: 3, photoX: 74, photoY: 50, photoZoom: 1, cardOpacity: .94, logoPosition: "left", textAlign: "left", showWebsite: true };

export function ManualCreativeEditor({ postId }: { postId: string }) {
  const [post,setPost]=useState<Post|null>(null);
  const [settings,setSettings]=useState<Settings>(defaults);
  const [headline,setHeadline]=useState("");
  const [support,setSupport]=useState("");
  const [cta,setCta]=useState("");
  const [template,setTemplate]=useState<Template>("promo-clean");
  const [preview,setPreview]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function load(){
    setLoading(true);
    try{
      const r=await fetch(`/api/admin/content/${postId}/creative-settings`,{cache:"no-store"});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Unable to load creative editor.");
      setPost(d.post); setSettings(d.settings||defaults); setHeadline(d.post.creativeHeadline||d.post.title||"");
      setSupport(d.post.creativeSupportingText||""); setCta(d.post.creativeCta||"Message MedMinds");
      setTemplate(d.post.creativeTemplate||"promo-clean"); setPreview(`${d.previewUrl}&editor=${Date.now()}`); setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load creative editor.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[postId]);

  function patch<K extends keyof Settings>(key:K,value:Settings[K]){setSettings(v=>({...v,[key]:value}));}
  async function save(){
    setSaving(true);setError("");setNotice("");
    try{
      const r=await fetch(`/api/admin/content/${postId}/creative-settings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...settings,template,headline,supportingText:support,cta})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Unable to save image edits.");
      setPost(d.post); setSettings(d.settings); setPreview(`${d.previewUrl}&editor=${Date.now()}`);
      setNotice("Image edits saved. This is now the version the Facebook Scheduler will attach.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to save image edits.");}
    finally{setSaving(false);}
  }
  function reset(){setSettings(defaults);setHeadline(post?.creativeHeadline||post?.title||"");setSupport(post?.creativeSupportingText||"");setCta(post?.creativeCta||"Message MedMinds");setTemplate(post?.creativeTemplate||"promo-clean");}

  if(loading)return <main className={styles.page}><div className={styles.loading}>Loading image editor…</div></main>;
  if(!post)return <main className={styles.page}><div className={styles.loading}>{error||"Creative not found."}</div></main>;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div><Link href="/admin/social">← Facebook Scheduler</Link><span>Manual creative editor</span><h1>{post.title}</h1><p>Fine-tune the generated image before approval or Facebook scheduling. Changes remain linked to this content record.</p></div><div className={styles.headerActions}><Link href="/admin/content">Content Studio</Link><Link className={styles.canvaLink} href={`/admin/content/${postId}/canva`}>Canva templates</Link></div></header>
    {(error||notice)&&<div className={error?styles.error:styles.notice}>{error||notice}</div>}
    <div className={styles.workspace}>
      <section className={styles.previewPanel}><div className={styles.previewFrame}><img src={preview||`/api/content/creative/${postId}?v=${post.creativeVersion||1}`} alt="Edited MedMinds Facebook creative" /></div><div className={styles.previewMeta}><strong>Facebook square · 1080 × 1080</strong><span>{post.creativeVisualMode==="photo"?"Photo creative":"Graphic creative"}</span></div></section>
      <section className={styles.controls}>
        <div className={styles.block}><h2>Text</h2><label>Headline<input value={headline} maxLength={120} onChange={e=>setHeadline(e.target.value)}/></label><label>Supporting text<textarea value={support} maxLength={320} onChange={e=>setSupport(e.target.value)}/></label><label>CTA<input value={cta} maxLength={60} onChange={e=>setCta(e.target.value)}/></label><label>Template<select value={template} onChange={e=>setTemplate(e.target.value as Template)}><option value="promo-clean">Promotion</option><option value="education-card">Educational card</option><option value="faq-notice">FAQ / notice</option></select></label></div>
        <div className={styles.block}><h2>Typography & density</h2><label>Text size <b>{Math.round(settings.textScale*100)}%</b><input type="range" min="0.75" max="1.25" step="0.05" value={settings.textScale} onChange={e=>patch("textScale",Number(e.target.value))}/></label><label>Benefit lines<select value={settings.supportLines} onChange={e=>patch("supportLines",Number(e.target.value))}><option value={0}>None</option><option value={1}>1 line</option><option value={2}>2 lines</option><option value={3}>3 lines</option></select></label><label>Text alignment<select value={settings.textAlign} onChange={e=>patch("textAlign",e.target.value as Settings["textAlign"])}><option value="left">Left</option><option value="center">Centre</option></select></label><label>Logo position<select value={settings.logoPosition} onChange={e=>patch("logoPosition",e.target.value as Settings["logoPosition"])}><option value="left">Top left</option><option value="center">Top centre</option></select></label><label className={styles.checkbox}><input type="checkbox" checked={settings.showWebsite} onChange={e=>patch("showWebsite",e.target.checked)}/> Show website / footer label</label></div>
        {post.creativeVisualMode==="photo"&&<div className={styles.block}><h2>Photo framing</h2><label>Horizontal focus <b>{settings.photoX}%</b><input type="range" min="0" max="100" value={settings.photoX} onChange={e=>patch("photoX",Number(e.target.value))}/></label><label>Vertical focus <b>{settings.photoY}%</b><input type="range" min="0" max="100" value={settings.photoY} onChange={e=>patch("photoY",Number(e.target.value))}/></label><label>Zoom <b>{settings.photoZoom.toFixed(2)}×</b><input type="range" min="1" max="1.45" step="0.05" value={settings.photoZoom} onChange={e=>patch("photoZoom",Number(e.target.value))}/></label><label>Text-card opacity <b>{Math.round(settings.cardOpacity*100)}%</b><input type="range" min="0.72" max="1" step="0.02" value={settings.cardOpacity} onChange={e=>patch("cardOpacity",Number(e.target.value))}/></label></div>}
        <div className={styles.actions}><button onClick={reset} disabled={saving}>Reset controls</button><button className={styles.primary} onClick={()=>void save()} disabled={saving}>{saving?"Saving…":"Apply & save image edits"}</button></div>
        <p className={styles.help}>After saving, return to Facebook Scheduler. The scheduler will freeze this exact rendered version when you choose a publishing time.</p>
      </section>
    </div>
  </div></main>;
}
