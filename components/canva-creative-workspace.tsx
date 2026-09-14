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
type CanvaDesign = {
  id: string;
  title?: string;
  updated_at?: number;
  design_types?: string[];
  urls?: { edit_url?: string; view_url?: string };
  thumbnail?: { width?: number; height?: number; url?: string };
};

type QuickCreate = { key:string; label:string; detail:string; body:Record<string,unknown> };

function canvaFailureMessage(code:string|null){
  if(code==="invalid_client")return "Canva rejected the configured Client Secret. Generate a new Client Secret for this integration in the Canva Developer Portal, replace CANVA_CLIENT_SECRET in Vercel, then reconnect.";
  if(code==="invalid_grant")return "The Canva authorization code expired or was already used. Start the Canva connection again.";
  if(code==="invalid_scope")return "The Canva integration is missing one or more requested permissions. Confirm the scopes are enabled in the Canva Developer Portal, then reconnect Canva.";
  if(code==="redirect_uri_mismatch"||code==="invalid_redirect_uri")return "The Canva redirect URL does not match the integration settings. Register https://sales.medmindslc.online/api/admin/canva/callback exactly in the Canva Developer Portal.";
  if(code==="missing_pkce")return "The secure Canva sign-in session expired before the callback completed. Start the Canva connection again in this browser.";
  if(code==="access_denied")return "Canva access was not approved. Reconnect and approve the requested permissions.";
  return "Canva authorization could not be completed. Reconnect Canva; if it fails again, check the Sales Agent runtime logs.";
}

export function CanvaCreativeWorkspace({ postId }: { postId: string }) {
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [templates,setTemplates]=useState<BrandTemplate[]>([]);
  const [designs,setDesigns]=useState<CanvaDesign[]>([]);
  const [loading,setLoading]=useState(true);
  const [templatesLoading,setTemplatesLoading]=useState(false);
  const [designsLoading,setDesignsLoading]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [designQuery,setDesignQuery]=useState("");
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
    }catch(e){setTemplates([]);setError(e instanceof Error?e.message:"Unable to load Canva templates.");}
    finally{setTemplatesLoading(false);}
  },[]);

  const loadDesigns=useCallback(async(q="")=>{
    setDesignsLoading(true);
    try{
      const suffix=q.trim()?`?q=${encodeURIComponent(q.trim())}`:"";
      const r=await fetch(`/api/admin/canva/designs${suffix}`,{cache:"no-store"});
      const d=await r.json();
      if(!r.ok){
        if(r.status===403)throw new Error("Canva is connected with the previous permission set. Click Reconnect Canva once to approve the expanded design and asset permissions.");
        throw new Error(d.error||"Unable to load Canva designs.");
      }
      setDesigns(Array.isArray(d.items)?d.items:[]);
    }catch(e){setDesigns([]);setError(e instanceof Error?e.message:"Unable to load Canva designs.");}
    finally{setDesignsLoading(false);}
  },[]);

  useEffect(()=>{void (async()=>{const data=await loadWorkspace();if(data?.canva.connected)await Promise.all([loadTemplates(),loadDesigns()]);})();},[loadWorkspace,loadTemplates,loadDesigns]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const result=params.get("canva");
    const errorCode=params.get("canva_error");
    if(result==="connected")setNotice("Canva is connected with the expanded creative permissions. Designs, assets, Brand Templates and export tools are available.");
    if(result==="setup-required")setError("Canva Developer credentials must be configured before connecting Canva.");
    if(result==="invalid-client")setError("Canva rejected the configured Client Secret. Generate a new Client Secret for this integration in the Canva Developer Portal, replace CANVA_CLIENT_SECRET in Vercel, then reconnect.");
    if(result==="connection-failed")setError(canvaFailureMessage(errorCode));
  },[]);

  async function createCanva(body:Record<string,unknown>,busyKey:string,success:string){
    setBusy(busyKey);setError("");setNotice("");
    try{
      const r=await fetch(`/api/admin/content/${postId}/canva/create`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok){
        if(r.status===403)throw new Error("Canva needs the newly enabled permissions. Click Reconnect Canva, approve access, then try again.");
        throw new Error(d.error||"Unable to create an editable Canva design.");
      }
      await loadWorkspace();
      setNotice(success);
      if(d.design?.editUrl)window.open(d.design.editUrl,"_blank","noopener,noreferrer");
    }catch(e){setError(e instanceof Error?e.message:"Unable to create Canva design.");}
    finally{setBusy("");}
  }

  async function createFromTemplate(template:BrandTemplate){
    await createCanva({templateId:template.id},template.id,`Created an editable Canva design from “${template.title}”. Edit it in Canva, then return here and import the final PNG.`);
  }

  async function copyExisting(design:CanvaDesign){
    await createCanva({designId:design.id,title:`${workspace?.post.title||design.title||"MedMinds"} - Canva copy`},`design-${design.id}`,`Created a working copy of “${design.title||"Canva design"}” and linked it to this MedMinds content record.`);
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
  const reconnectHref=`/api/admin/canva/connect?returnTo=${encodeURIComponent(returnTo)}`;
  const preview=`${workspace.previewUrl}${workspace.previewUrl.includes("?")?"&":"?"}canvaPreview=${previewNonce}`;
  const quickCreates:QuickCreate[]=[
    {key:"current",label:"Edit current MedMinds creative",detail:"Upload the current Sales Agent image to Canva and continue editing there.",body:{source:"current_creative",title:workspace.post.title}},
    {key:"square",label:"Square social post",detail:"1080 × 1080",body:{width:1080,height:1080,title:`${workspace.post.title} - Square`}},
    {key:"portrait",label:"Portrait social post",detail:"1080 × 1350",body:{width:1080,height:1350,title:`${workspace.post.title} - Portrait`}},
    {key:"story",label:"Story / status",detail:"1080 × 1920",body:{width:1080,height:1920,title:`${workspace.post.title} - Story`}},
    {key:"landscape",label:"Landscape campaign",detail:"1200 × 628",body:{width:1200,height:628,title:`${workspace.post.title} - Landscape`}}
  ];

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div><Link href="/admin/social">← Facebook Scheduler</Link><span>Canva + MedMinds</span><h1>Canva creative workspace</h1><p>Create, reuse and edit Canva designs directly from the Sales Agent. Brand Templates are now one option rather than the whole integration.</p></div><div className={styles.headerActions}><Link href={`/admin/content/${postId}/image-editor`}>Manual editor</Link><Link href="/admin/content">Content Studio</Link></div></header>
    {(error||notice)&&<div className={error?styles.error:styles.notice}>{error||notice}</div>}

    <div className={styles.workspace}>
      <section className={styles.previewPanel}><div className={styles.previewFrame}><img src={preview} alt="Current MedMinds creative linked to this content" /></div><div className={styles.previewMeta}><div><span>Current Sales Agent image</span><strong>{workspace.post.title}</strong></div><b>{workspace.imported?.isCurrent?"CANVA VERSION ACTIVE":"MEDMINDS VERSION ACTIVE"}</b></div>{workspace.imported&&<p className={styles.importNote}>Last Canva import: {new Date(workspace.imported.importedAt).toLocaleString()}.</p>}</section>

      <section className={styles.sidePanel}>
        <div className={`${styles.connection} ${workspace.canva.connected?styles.connected:""}`}><div><span className={styles.micro}>Canva connection</span><h2>{workspace.canva.connected?"Connected":"Not connected"}</h2><p>{workspace.canva.connected?"Expanded design, asset, folder, comment, Brand Template and export permissions are configured.":workspace.canva.configured?"Connect the Canva account that owns the MedMinds Brand Kit and creative library.":"Add the Canva Developer credentials to Vercel, then connect the account once."}</p></div>{workspace.canva.configured&&<a className={styles.canvaButton} href={reconnectHref}>{workspace.canva.connected?"Reconnect Canva":"Connect Canva"}</a>}</div>
        {!workspace.canva.configured&&<div className={styles.setup}><strong>One-time Canva Developer setup</strong><p>Add <code>CANVA_CLIENT_ID</code> and <code>CANVA_CLIENT_SECRET</code> to the Sales Agent Vercel project. Register this OAuth redirect URL:</p><code>https://sales.medmindslc.online/api/admin/canva/callback</code><p>After deployment, return here and connect Canva.</p></div>}

        {workspace.canva.connected&&<>
          <div className={styles.sectionHeading}><div><span className={styles.micro}>Quick create</span><h2>Start in Canva without a template</h2></div></div>
          <div className={styles.templates}>{quickCreates.map(item=><article key={item.key} className={styles.templateCard}><div className={styles.templatePlaceholder}>{item.detail}</div><div><h3>{item.label}</h3><div className={styles.templateActions}><button className={styles.primary} disabled={Boolean(busy)} onClick={()=>void createCanva(item.body,`quick-${item.key}`,`${item.label} created in Canva and linked to this content.`)}>{busy===`quick-${item.key}`?"Creating…":"Create in Canva"}</button></div></div></article>)}</div>

          <div className={styles.sectionHeading}><div><span className={styles.micro}>Canva designs</span><h2>Reuse an existing Canva design</h2></div><button onClick={()=>void loadDesigns(designQuery)} disabled={designsLoading}>{designsLoading?"Refreshing…":"Refresh"}</button></div>
          <div className={styles.search}><input value={designQuery} onChange={e=>setDesignQuery(e.target.value)} placeholder="Search your Canva designs" onKeyDown={e=>{if(e.key==="Enter")void loadDesigns(designQuery);}}/><button onClick={()=>void loadDesigns(designQuery)} disabled={designsLoading}>Search</button></div>
          {designsLoading?<div className={styles.empty}>Loading Canva designs…</div>:designs.length===0?<div className={styles.empty}><strong>No Canva designs returned.</strong><p>If you connected before the permissions were expanded, use Reconnect Canva above once, approve access, then refresh.</p></div>:<div className={styles.templates}>{designs.map(design=><article key={design.id} className={styles.templateCard}>{design.thumbnail?.url?<img src={design.thumbnail.url} alt={`${design.title||"Canva design"} thumbnail`}/>:<div className={styles.templatePlaceholder}>{design.design_types?.[0]||"Canva design"}</div>}<div><h3>{design.title||"Untitled Canva design"}</h3><div className={styles.templateActions}><button className={styles.primary} disabled={Boolean(busy)} onClick={()=>void copyExisting(design)}>{busy===`design-${design.id}`?"Copying…":"Use a copy"}</button>{design.urls?.edit_url&&<a href={design.urls.edit_url} target="_blank" rel="noreferrer">Open original</a>}</div></div></article>)}</div>}

          <div className={styles.sectionHeading}><div><span className={styles.micro}>Brand Templates</span><h2>Use a controlled brand layout</h2></div><button onClick={()=>void loadTemplates(query)} disabled={templatesLoading}>{templatesLoading?"Refreshing…":"Refresh"}</button></div>
          <div className={styles.search}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your Canva Brand Templates" onKeyDown={e=>{if(e.key==="Enter")void loadTemplates(query);}}/><button onClick={()=>void loadTemplates(query)} disabled={templatesLoading}>Search</button></div>
          {templatesLoading?<div className={styles.empty}>Loading Canva Brand Templates…</div>:templates.length===0?<div className={styles.empty}><strong>No published Brand Templates found.</strong><p>This no longer blocks Canva use. You can create a new design, edit the current MedMinds creative, or reuse an existing Canva design above.</p></div>:<div className={styles.templates}>{templates.map(template=><article key={template.id} className={styles.templateCard}>{template.thumbnail?.url?<img src={template.thumbnail.url} alt={`${template.title} Canva template`}/>:<div className={styles.templatePlaceholder}>Canva template</div>}<div><h3>{template.title}</h3><div className={styles.templateActions}><button className={styles.primary} disabled={Boolean(busy)} onClick={()=>void createFromTemplate(template)}>{busy===template.id?"Creating…":"Use template"}</button>{template.create_url&&<a href={template.create_url} target="_blank" rel="noreferrer">Open in Canva</a>}</div></div></article>)}</div>}
        </>}

        {workspace.design&&<div className={styles.linked}><span className={styles.micro}>Linked Canva design</span><h2>Continue editing in Canva</h2><p>The linked design remains editable in Canva. When satisfied, import the latest PNG to make it the active Facebook creative.</p><div className={styles.linkedActions}><a className={styles.canvaButton} href={workspace.design.editUrl} target="_blank" rel="noreferrer">Edit in Canva</a><button className={styles.primary} disabled={busy==="import"} onClick={()=>void importLatest()}>{busy==="import"?"Importing…":"Import latest PNG"}</button></div></div>}

        <div className={styles.explainer}><strong>Expanded Canva workflow</strong><p>The Sales Agent can now start blank social designs, send the current MedMinds creative into Canva, reuse copies of existing designs, use Brand Templates, and import the finished design back for scheduling. Canva remains the editor while the Sales Agent remains the content and publishing system.</p></div>
      </section>
    </div>
  </div></main>;
}
