"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./canva-creative-workspace.module.css";

type CanvaStatus = { configured: boolean; connected: boolean; connectedAt: string | null; expiresAt: string | null };
type LinkedDesign = { postId: string; designId: string; editUrl: string; viewUrl: string | null; updatedAt: string };
type Imported = { designId: string; creativeVersion: number; importedAt: string; isCurrent: boolean } | null;
type Workspace = {
  post: { id: string; title: string; creativeVersion: number; creativeGeneratedAt: string | null; mediaUrl: string | null };
  canva: CanvaStatus;
  design: LinkedDesign | null;
  imported: Imported;
  previewUrl: string;
};
type BrandTemplate = {
  id: string;
  title: string;
  create_url?: string;
  view_url?: string;
  thumbnail?: { width?: number; height?: number; url?: string };
};

function canvaFailureMessage(code:string|null){
  if(code==="invalid_client")return "Canva rejected the configured Client Secret. Generate a new Client Secret for this integration in the Canva Developer Portal, replace CANVA_CLIENT_SECRET in Vercel, then reconnect.";
  if(code==="invalid_grant")return "The Canva authorization code expired or was already used. Start the Canva connection again.";
  if(code==="invalid_scope")return "The Canva integration is missing one or more required scopes. Enable the requested design, Brand Template and profile scopes in the Canva Developer Portal.";
  if(code==="redirect_uri_mismatch"||code==="invalid_redirect_uri")return "The Canva redirect URL does not match the integration settings. Register https://sales.medmindslc.online/api/admin/canva/callback exactly in the Canva Developer Portal.";
  if(code==="missing_pkce")return "The secure Canva sign-in session expired before the callback completed. Start the Canva connection again in this browser.";
  if(code==="access_denied")return "Canva access was not approved. Reconnect and approve the requested permissions.";
  return "Canva authorization could not be completed. Reconnect Canva; if it fails again, check the error details in the Sales Agent runtime logs.";
}

export function CanvaCreativeWorkspace({ postId }: { postId: string }) {
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [templates,setTemplates]=useState<BrandTemplate[]>([]);
  const [loading,setLoading]=useState(true);
  const [templatesLoading,setTemplatesLoading]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [previewNonce,setPreviewNonce]=useState(Date.now());

  const loadWorkspace=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch(`/api/admin/content/${postId}/canva`,{cache:"no-store"});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Unable to load Canva workspace.");
      setWorkspace(d);
      setError("");
      return d as Workspace;
    }catch(e){setError(e instanceof Error?e.message:"Unable to load Canva workspace.");return null;}
    finally{setLoading(false);}
  },[postId]);

  const loadTemplates=useCallback(async(q="")=>{
    setTemplatesLoading(true);
    try{
      const suffix=q.trim()?`?q=${encodeURIComponent(q.trim())}`:"";
      const r=await fetch(`/api/admin/canva/templates${suffix}`,{cache:"no-store"});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Unable to load Canva Brand Templates.");
      setTemplates(Array.isArray(d.items)?d.items:[]);
      setError("");
    }catch(e){setTemplates([]);setError(e instanceof Error?e.message:"Unable to load Canva templates.");}
    finally{setTemplatesLoading(false);}
  },[]);

  useEffect(()=>{void (async()=>{const data=await loadWorkspace();if(data?.canva.connected)await loadTemplates();})();},[loadWorkspace,loadTemplates]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const result=params.get("canva");
    const errorCode=params.get("canva_error");
    if(result==="connected")setNotice("Canva is connected. You can now use Brand Templates in this content workflow.");
    if(result==="setup-required")setError("Canva Developer credentials must be configured before connecting Canva.");
    if(result==="invalid-client")setError("Canva rejected the configured Client Secret. Generate a new Client Secret for this integration in the Canva Developer Portal, replace CANVA_CLIENT_SECRET in Vercel, then reconnect.");
    if(result==="connection-failed")setError(canvaFailureMessage(errorCode));
  },[]);

  async function createFromTemplate(template:BrandTemplate){
    setBusy(template.id);setError("");setNotice("");
    try{
      const r=await fetch(`/api/admin/content/${postId}/canva/create`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({templateId:template.id})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Unable to create an editable Canva design.");
      await loadWorkspace();
      setNotice(`Created an editable Canva design from “${template.title}”. Open it in Canva, make your changes, then return here and import the final PNG.`);
      if(d.design?.editUrl)window.open(d.design.editUrl,"_blank","noopener,noreferrer");
    }catch(e){setError(e instanceof Error?e.message:"Unable to create Canva design.");}
    finally{setBusy("");}
  }

  async function importLatest(){
    setBusy("import");setError("");setNotice("");
    try{
      const r=await fetch(`/api/admin/content/${postId}/canva/export`,{method:"POST"});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Unable to import the latest Canva design.");
      setPreviewNonce(Date.now());
      await loadWorkspace();
      setNotice("Latest Canva PNG imported. It is now the active image linked to this content and will be used by Facebook Scheduler when you schedule the post.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to import Canva design.");}
    finally{setBusy("");}
  }

  if(loading&&!workspace)return <main className={styles.page}><div className={styles.loading}>Loading Canva workspace…</div></main>;
  if(!workspace)return <main className={styles.page}><div className={styles.loading}>{error||"Content not found."}</div></main>;
  const returnTo=`/admin/content/${postId}/canva`;
  const preview=`${workspace.previewUrl}${workspace.previewUrl.includes("?")?"&":"?"}canvaPreview=${previewNonce}`;

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div><Link href="/admin/social">← Facebook Scheduler</Link><span>Canva + MedMinds</span><h1>Canva creative workspace</h1><p>Use a Canva Brand Template, edit the design in Canva, then import the final PNG back into the same Sales Agent content record.</p></div><div className={styles.headerActions}><Link href={`/admin/content/${postId}/image-editor`}>Manual editor</Link><Link href="/admin/content">Content Studio</Link></div></header>
    {(error||notice)&&<div className={error?styles.error:styles.notice}>{error||notice}</div>}

    <div className={styles.workspace}>
      <section className={styles.previewPanel}><div className={styles.previewFrame}><img src={preview} alt="Current MedMinds creative linked to this content" /></div><div className={styles.previewMeta}><div><span>Current Sales Agent image</span><strong>{workspace.post.title}</strong></div><b>{workspace.imported?.isCurrent?"CANVA VERSION ACTIVE":"MEDMINDS VERSION ACTIVE"}</b></div>{workspace.imported&&<p className={styles.importNote}>Last Canva import: {new Date(workspace.imported.importedAt).toLocaleString()}.</p>}</section>

      <section className={styles.sidePanel}>
        <div className={`${styles.connection} ${workspace.canva.connected?styles.connected:""}`}><div><span className={styles.micro}>Canva connection</span><h2>{workspace.canva.connected?"Connected":"Not connected"}</h2><p>{workspace.canva.connected?"Brand Templates and design export are available to this Sales Agent workspace.":workspace.canva.configured?"Connect the Canva account that owns the MedMinds Brand Kit and templates.":"Add the Canva Developer credentials to Vercel, then connect the account once."}</p></div>{!workspace.canva.connected&&workspace.canva.configured&&<a className={styles.canvaButton} href={`/api/admin/canva/connect?returnTo=${encodeURIComponent(returnTo)}`}>Connect Canva</a>}</div>
        {!workspace.canva.configured&&<div className={styles.setup}><strong>One-time Canva Developer setup</strong><p>Add <code>CANVA_CLIENT_ID</code> and <code>CANVA_CLIENT_SECRET</code> to the Sales Agent Vercel project. Register this OAuth redirect URL:</p><code>https://sales.medmindslc.online/api/admin/canva/callback</code><p>After deployment, return here and connect Canva.</p></div>}

        {workspace.canva.connected&&<>
          <div className={styles.sectionHeading}><div><span className={styles.micro}>Brand Templates</span><h2>Choose a Canva template</h2></div><button onClick={()=>void loadTemplates(query)} disabled={templatesLoading}>{templatesLoading?"Refreshing…":"Refresh"}</button></div>
          <div className={styles.search}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your Canva Brand Templates" onKeyDown={e=>{if(e.key==="Enter")void loadTemplates(query);}}/><button onClick={()=>void loadTemplates(query)} disabled={templatesLoading}>Search</button></div>
          {templatesLoading?<div className={styles.empty}>Loading Canva Brand Templates…</div>:templates.length===0?<div className={styles.empty}><strong>No published Brand Templates found.</strong><p>In Canva, publish your preferred MedMinds Facebook designs as Brand Templates, then return here and press Refresh. Your existing Brand Kit can still be used when creating those templates.</p></div>:<div className={styles.templates}>{templates.map(template=><article key={template.id} className={styles.templateCard}>{template.thumbnail?.url?<img src={template.thumbnail.url} alt={`${template.title} Canva template`}/>:<div className={styles.templatePlaceholder}>Canva template</div>}<div><h3>{template.title}</h3><div className={styles.templateActions}><button className={styles.primary} disabled={Boolean(busy)} onClick={()=>void createFromTemplate(template)}>{busy===template.id?"Creating…":"Use template"}</button>{template.create_url&&<a href={template.create_url} target="_blank" rel="noreferrer">Open in Canva</a>}</div></div></article>)}</div>}
        </>}

        {workspace.design&&<div className={styles.linked}><span className={styles.micro}>Linked Canva design</span><h2>Continue editing in Canva</h2><p>The design remains editable in Canva. When you are satisfied, import the latest PNG to make it the active Facebook creative.</p><div className={styles.linkedActions}><a className={styles.canvaButton} href={workspace.design.editUrl} target="_blank" rel="noreferrer">Edit in Canva</a><button className={styles.primary} disabled={busy==="import"} onClick={()=>void importLatest()}>{busy==="import"?"Importing…":"Import latest PNG"}</button></div></div>}

        <div className={styles.explainer}><strong>How publishing works</strong><p>Canva editing does not bypass the Sales Agent. After you import the final PNG, it becomes this content record’s active image. When you later schedule the post, Facebook Scheduler freezes that exact imported image together with the approved caption.</p></div>
      </section>
    </div>
  </div></main>;
}
