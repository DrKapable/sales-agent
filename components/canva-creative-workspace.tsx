"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./canva-creative-workspace.module.css";

type CanvaStatus = { configured:boolean; connected:boolean; connectedAt:string|null; expiresAt:string|null };
type LinkedDesign = {
  postId:string;
  designId:string;
  editUrl:string;
  viewUrl:string|null;
  openUrl?:string;
  updatedAt:string;
  accessible?:boolean|null;
  title?:string|null;
  thumbnail?:{width?:number;height?:number;url?:string}|null;
  pageCount?:number|null;
  designTypes?:string[];
  error?:string|null;
  errorCode?:string|null;
};
type Imported = { designId:string; creativeVersion:number; importedAt:string; isCurrent:boolean } | null;
type Workspace = {
  post:{ id:string; title:string; creativeVersion:number; creativeGeneratedAt:string|null; mediaUrl:string|null };
  canva:CanvaStatus;
  design:LinkedDesign|null;
  imported:Imported;
  previewUrl:string;
};
type BrandTemplate = {
  id:string;
  title:string;
  create_url?:string;
  view_url?:string;
  thumbnail?:{width?:number;height?:number;url?:string};
};
type CanvaDesign = {
  id:string;
  title?:string;
  updated_at?:number;
  design_types?:string[];
  open_url?:string;
  thumbnail?:{width?:number;height?:number;url?:string};
};
type CanvaHealth = {
  apiReachable:boolean;
  capabilities:string[];
  teamUser?:{user_id?:string;team_id?:string}|null;
  error?:string;
};
type QuickCreate = { key:string; label:string; detail:string; body:Record<string,unknown> };

function canvaFailureMessage(code:string|null){
  if(code==="invalid_client")return "Canva rejected the configured Client Secret. Generate a new Client Secret for this integration, replace CANVA_CLIENT_SECRET in Vercel, then reconnect.";
  if(code==="invalid_grant")return "The Canva authorization code expired or was already used. Start the Canva connection again.";
  if(code==="invalid_scope")return "The Canva integration is missing one or more requested permissions. Confirm the scopes are enabled, then reconnect Canva.";
  if(code==="redirect_uri_mismatch"||code==="invalid_redirect_uri")return "The Canva redirect URL does not match the integration settings. Register https://sales.medmindslc.online/api/admin/canva/callback exactly.";
  if(code==="missing_pkce")return "The secure Canva sign-in session expired before the callback completed. Start the Canva connection again in this browser.";
  if(code==="access_denied")return "Canva access was not approved. Reconnect and approve the requested permissions.";
  return "Canva authorization could not be completed. Reconnect Canva and try again.";
}

export function CanvaCreativeWorkspace({ postId }: { postId:string }) {
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [templates,setTemplates]=useState<BrandTemplate[]>([]);
  const [designs,setDesigns]=useState<CanvaDesign[]>([]);
  const [templateContinuation,setTemplateContinuation]=useState<string|null>(null);
  const [designContinuation,setDesignContinuation]=useState<string|null>(null);
  const [health,setHealth]=useState<CanvaHealth|null>(null);
  const [loading,setLoading]=useState(true);
  const [templatesLoading,setTemplatesLoading]=useState(false);
  const [designsLoading,setDesignsLoading]=useState(false);
  const [healthLoading,setHealthLoading]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [designQuery,setDesignQuery]=useState("");
  const [previewNonce,setPreviewNonce]=useState(Date.now());

  const returnTo=`/admin/content/${postId}/canva`;
  const freshOpenHref=useCallback((designId:string)=>`/api/admin/canva/designs/${encodeURIComponent(designId)}/open?state=${encodeURIComponent(`p-${postId}`)}&returnTo=${encodeURIComponent(returnTo)}`,[postId,returnTo]);

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

  const loadTemplates=useCallback(async(q="",continuation="")=>{
    setTemplatesLoading(true);
    try{
      const params=new URLSearchParams();
      if(q.trim())params.set("q",q.trim());
      if(continuation)params.set("continuation",continuation);
      const r=await fetch(`/api/admin/canva/templates${params.size?`?${params.toString()}`:""}`,{cache:"no-store"});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Unable to load Canva Brand Templates.");
      const items=Array.isArray(d.items)?d.items:[];
      setTemplates(current=>continuation?[...current,...items]:items);
      setTemplateContinuation(d.continuation||null);
    }catch(e){if(!continuation)setTemplates([]);setError(e instanceof Error?e.message:"Unable to load Canva templates.");}
    finally{setTemplatesLoading(false);}
  },[]);

  const loadDesigns=useCallback(async(q="",continuation="")=>{
    setDesignsLoading(true);
    try{
      const params=new URLSearchParams();
      if(q.trim())params.set("q",q.trim());
      if(continuation)params.set("continuation",continuation);
      const r=await fetch(`/api/admin/canva/designs${params.size?`?${params.toString()}`:""}`,{cache:"no-store"});
      const d=await r.json();
      if(!r.ok){
        if(r.status===401||d.code==="reauthorization_required")throw new Error("Your Canva session needs authorization again. Click Reconnect Canva and approve access.");
        throw new Error(d.error||"Unable to load Canva designs.");
      }
      const items=Array.isArray(d.items)?d.items:[];
      setDesigns(current=>continuation?[...current,...items]:items);
      setDesignContinuation(d.continuation||null);
    }catch(e){if(!continuation)setDesigns([]);setError(e instanceof Error?e.message:"Unable to load Canva designs.");}
    finally{setDesignsLoading(false);}
  },[]);

  const checkHealth=useCallback(async()=>{
    setHealthLoading(true);
    try{
      const r=await fetch("/api/admin/canva/health",{cache:"no-store"});
      const d=await r.json();
      setHealth(d);
      if(!r.ok)throw new Error(d.error||"Canva connection check failed.");
      setNotice("Canva API connection verified successfully.");
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Canva connection check failed.");}
    finally{setHealthLoading(false);}
  },[]);

  useEffect(()=>{void (async()=>{const data=await loadWorkspace();if(data?.canva.connected)await Promise.all([loadTemplates(),loadDesigns()]);})();},[loadWorkspace,loadTemplates,loadDesigns]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const result=params.get("canva");
    const errorCode=params.get("canva_error");
    const openFailed=params.get("canva_open")==="failed";
    const openMessage=params.get("canva_open_message");
    if(result==="connected")setNotice("Canva is connected with the expanded creative permissions.");
    if(result==="setup-required")setError("Canva Developer credentials must be configured before connecting Canva.");
    if(result==="invalid-client")setError("Canva rejected the configured Client Secret. Replace CANVA_CLIENT_SECRET in Vercel, then reconnect.");
    if(result==="connection-failed")setError(canvaFailureMessage(errorCode));
    if(openFailed)setError(openMessage||"The Canva design could not be opened. Refresh the workspace or reconnect Canva.");
  },[]);

  function preparePopup(){
    const popup=window.open("about:blank","_blank");
    if(popup){try{popup.opener=null;popup.document.title="Opening Canva…";popup.document.body.innerHTML='<p style="font-family:system-ui;padding:24px">Opening Canva…</p>';}catch{}}
    return popup;
  }

  function navigateToCanva(url:string,popup:Window|null){
    if(popup&&!popup.closed){popup.location.replace(url);return;}
    window.location.assign(url);
  }

  async function createCanva(body:Record<string,unknown>,busyKey:string,success:string){
    const popup=preparePopup();
    setBusy(busyKey);setError("");setNotice("");
    try{
      const r=await fetch(`/api/admin/content/${postId}/canva/create`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok){
        if(r.status===401||d.code==="reauthorization_required")throw new Error("Canva authorization has expired. Reconnect Canva and try again.");
        throw new Error(d.error||"Unable to create an editable Canva design.");
      }
      await loadWorkspace();
      setNotice(success);
      const openUrl=d.design?.openUrl||d.design?.designId&&freshOpenHref(d.design.designId);
      if(openUrl)navigateToCanva(openUrl,popup);else popup?.close();
    }catch(e){popup?.close();setError(e instanceof Error?e.message:"Unable to create Canva design.");}
    finally{setBusy("");}
  }

  async function createFromTemplate(template:BrandTemplate){
    await createCanva({templateId:template.id},template.id,`Created an editable Canva design from “${template.title}”.`);
  }

  async function copyExisting(design:CanvaDesign){
    await createCanva({designId:design.id,title:`${workspace?.post.title||design.title||"MedMinds"} - Canva copy`},`design-${design.id}`,`Created a working copy of “${design.title||"Canva design"}”.`);
  }

  async function importLatest(){
    setBusy("import");setError("");setNotice("");
    try{
      const r=await fetch(`/api/admin/content/${postId}/canva/export`,{method:"POST"});
      const d=await r.json();
      if(!r.ok){
        if(r.status===401||d.code==="reauthorization_required")throw new Error("Canva authorization has expired. Reconnect Canva and try again.");
        throw new Error(d.error||"Unable to import the latest Canva design.");
      }
      setPreviewNonce(Date.now());
      await loadWorkspace();
      setNotice(d.pageCount>1?`Imported page 1 of a ${d.pageCount}-page Canva design as the active image.`:"Latest Canva PNG imported and set as the active image.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to import Canva design.");}
    finally{setBusy("");}
  }

  if(loading&&!workspace)return <main className={styles.page}><div className={styles.loading}>Loading Canva workspace…</div></main>;
  if(!workspace)return <main className={styles.page}><div className={styles.loading}>{error||"Content not found."}</div></main>;
  const reconnectHref=`/api/admin/canva/connect?returnTo=${encodeURIComponent(returnTo)}`;
  const preview=`${workspace.previewUrl}${workspace.previewUrl.includes("?")?"&":"?"}canvaPreview=${previewNonce}`;
  const quickCreates:QuickCreate[]=[
    {key:"current",label:"Edit current MedMinds creative",detail:"Upload current image",body:{source:"current_creative",title:workspace.post.title}},
    {key:"square",label:"Square social post",detail:"1080 × 1080",body:{width:1080,height:1080,title:`${workspace.post.title} - Square`}},
    {key:"portrait",label:"Portrait social post",detail:"1080 × 1350",body:{width:1080,height:1350,title:`${workspace.post.title} - Portrait`}},
    {key:"story",label:"Story / status",detail:"1080 × 1920",body:{width:1080,height:1920,title:`${workspace.post.title} - Story`}},
    {key:"landscape",label:"Landscape campaign",detail:"1200 × 628",body:{width:1200,height:628,title:`${workspace.post.title} - Landscape`}},
    {key:"presentation",label:"Presentation",detail:"Canva presentation",body:{preset:"presentation",title:`${workspace.post.title} - Presentation`}},
    {key:"doc",label:"Canva Doc",detail:"Document",body:{preset:"doc",title:`${workspace.post.title} - Doc`}},
    {key:"email",label:"Email design",detail:"Email campaign",body:{preset:"email",title:`${workspace.post.title} - Email`}},
    {key:"whiteboard",label:"Whiteboard",detail:"Collaborative board",body:{preset:"whiteboard",title:`${workspace.post.title} - Whiteboard`}}
  ];

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div><Link href="/admin/social">← Facebook Scheduler</Link><span>Canva + MedMinds</span><h1>Canva creative workspace</h1><p>Create, reuse and edit Canva designs directly from the Sales Agent. Every edit action now requests a fresh Canva link before opening the editor.</p></div><div className={styles.headerActions}><Link href={`/admin/content/${postId}/image-editor`}>Manual editor</Link><Link href="/admin/content">Content Studio</Link></div></header>
    {(error||notice)&&<div className={error?styles.error:styles.notice}>{error||notice}</div>}

    <div className={styles.workspace}>
      <section className={styles.previewPanel}><div className={styles.previewFrame}><img src={preview} alt="Current MedMinds creative linked to this content" /></div><div className={styles.previewMeta}><div><span>Current Sales Agent image</span><strong>{workspace.post.title}</strong></div><b>{workspace.imported?.isCurrent?"CANVA VERSION ACTIVE":"MEDMINDS VERSION ACTIVE"}</b></div>{workspace.imported&&<p className={styles.importNote}>Last Canva import: {new Date(workspace.imported.importedAt).toLocaleString()}.</p>}</section>

      <section className={styles.sidePanel}>
        <div className={`${styles.connection} ${workspace.canva.connected?styles.connected:""}`}><div><span className={styles.micro}>Canva connection</span><h2>{workspace.canva.connected?"Connected":"Not connected"}</h2><p>{workspace.canva.connected?"Design, asset, folder, comment, Brand Template and export permissions are configured.":workspace.canva.configured?"Connect the Canva account that owns the MedMinds Brand Kit and creative library.":"Add the Canva Developer credentials to Vercel, then connect the account once."}</p>{health&&<p>{health.apiReachable?`API verified${health.capabilities.length?` · Capabilities: ${health.capabilities.join(", ")}`:""}`:health.error||"API check failed."}</p>}</div><div className={styles.connectionActions}>{workspace.canva.configured&&<a className={styles.canvaButton} href={reconnectHref}>{workspace.canva.connected?"Reconnect Canva":"Connect Canva"}</a>}{workspace.canva.connected&&<button onClick={()=>void checkHealth()} disabled={healthLoading}>{healthLoading?"Checking…":"Check connection"}</button>}</div></div>

        {workspace.canva.connected&&<>
          <div className={styles.sectionHeading}><div><span className={styles.micro}>Quick create</span><h2>Start a Canva design</h2></div></div>
          <div className={styles.templates}>{quickCreates.map(item=><article key={item.key} className={styles.templateCard}><div className={styles.templatePlaceholder}>{item.detail}</div><div><h3>{item.label}</h3><div className={styles.templateActions}><button className={styles.primary} disabled={Boolean(busy)} onClick={()=>void createCanva(item.body,`quick-${item.key}`,`${item.label} created and linked to this content.`)}>{busy===`quick-${item.key}`?"Creating…":"Create in Canva"}</button></div></div></article>)}</div>

          <div className={styles.sectionHeading}><div><span className={styles.micro}>Canva designs</span><h2>Reuse an existing design</h2></div><button onClick={()=>void loadDesigns(designQuery)} disabled={designsLoading}>{designsLoading?"Refreshing…":"Refresh"}</button></div>
          <div className={styles.search}><input value={designQuery} onChange={e=>setDesignQuery(e.target.value)} placeholder="Search your Canva designs" onKeyDown={e=>{if(e.key==="Enter")void loadDesigns(designQuery);}}/><button onClick={()=>void loadDesigns(designQuery)} disabled={designsLoading}>Search</button></div>
          {designsLoading&&designs.length===0?<div className={styles.empty}>Loading Canva designs…</div>:designs.length===0?<div className={styles.empty}><strong>No Canva designs returned.</strong><p>Reconnect Canva if this account should contain designs.</p></div>:<div className={styles.templates}>{designs.map(design=><article key={design.id} className={styles.templateCard}>{design.thumbnail?.url?<img src={design.thumbnail.url} alt={`${design.title||"Canva design"} thumbnail`}/>:<div className={styles.templatePlaceholder}>{design.design_types?.[0]||"Canva design"}</div>}<div><h3>{design.title||"Untitled Canva design"}</h3><div className={styles.templateActions}><button className={styles.primary} disabled={Boolean(busy)} onClick={()=>void copyExisting(design)}>{busy===`design-${design.id}`?"Copying…":"Use a copy"}</button><a href={freshOpenHref(design.id)} target="_blank" rel="noreferrer">Edit original</a></div></div></article>)}</div>}
          {designContinuation&&<div className={styles.pager}><button disabled={designsLoading} onClick={()=>void loadDesigns(designQuery,designContinuation)}>{designsLoading?"Loading…":"Load more designs"}</button></div>}

          <div className={styles.sectionHeading}><div><span className={styles.micro}>Brand Templates</span><h2>Use a controlled brand layout</h2></div><button onClick={()=>void loadTemplates(query)} disabled={templatesLoading}>{templatesLoading?"Refreshing…":"Refresh"}</button></div>
          <div className={styles.search}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your Canva Brand Templates" onKeyDown={e=>{if(e.key==="Enter")void loadTemplates(query);}}/><button onClick={()=>void loadTemplates(query)} disabled={templatesLoading}>Search</button></div>
          {templatesLoading&&templates.length===0?<div className={styles.empty}>Loading Canva Brand Templates…</div>:templates.length===0?<div className={styles.empty}><strong>No published Brand Templates found.</strong><p>This does not block Canva use. Use Quick create or reuse an existing design above.</p></div>:<div className={styles.templates}>{templates.map(template=><article key={template.id} className={styles.templateCard}>{template.thumbnail?.url?<img src={template.thumbnail.url} alt={`${template.title} Canva template`}/>:<div className={styles.templatePlaceholder}>Canva template</div>}<div><h3>{template.title}</h3><div className={styles.templateActions}><button className={styles.primary} disabled={Boolean(busy)} onClick={()=>void createFromTemplate(template)}>{busy===template.id?"Creating…":"Use template"}</button>{template.create_url&&<a href={template.create_url} target="_blank" rel="noreferrer">Preview / remix</a>}</div></div></article>)}</div>}
          {templateContinuation&&<div className={styles.pager}><button disabled={templatesLoading} onClick={()=>void loadTemplates(query,templateContinuation)}>{templatesLoading?"Loading…":"Load more templates"}</button></div>}
        </>}

        {workspace.design&&<div className={styles.linked}><span className={styles.micro}>Linked Canva design</span><h2>{workspace.design.title||"Continue editing in Canva"}</h2><p>{workspace.design.accessible===false?workspace.design.error||"The connected Canva account can no longer access this design.":`Design ID ${workspace.design.designId}${workspace.design.pageCount?` · ${workspace.design.pageCount} page${workspace.design.pageCount===1?"":"s"}`:""}. A fresh editor link is generated each time you open it.`}</p><div className={styles.linkedActions}>{workspace.design.accessible!==false&&<a className={styles.canvaButton} href={workspace.design.openUrl||freshOpenHref(workspace.design.designId)} target="_blank" rel="noreferrer">Edit in Canva</a>}<button className={styles.primary} disabled={busy==="import"||workspace.design.accessible===false} onClick={()=>void importLatest()}>{busy==="import"?"Importing…":"Import latest PNG"}</button>{workspace.design.accessible===false&&<a href={reconnectHref}>Reconnect Canva</a>}</div></div>}

        <div className={styles.explainer}><strong>How this integration now works</strong><p>The database keeps the durable Canva design ID, not a trusted permanent editor URL. When you click Edit, the Sales Agent asks Canva for a fresh user-bound editor link. Creating designs uses a popup opened immediately from your click to avoid mobile popup blocking, and exports retry with refreshed OAuth tokens when required.</p></div>
      </section>
    </div>
  </div></main>;
}
