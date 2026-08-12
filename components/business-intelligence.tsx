"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { teamDirectory } from "@/lib/team-directory";

type Snapshot = any;

const reviewsUrl = "https://maps.app.goo.gl/4kL9cCutoRFFs3aD8";
const collectReviewUrl = "https://share.google/QdIE9kViJz0Igntzb";

export function BusinessIntelligence() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"overview" | "leads" | "operations" | "intelligence">("overview");

  async function refresh() {
    const response = await fetch("/api/admin/business", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Unable to load business intelligence.");
    setData(json);
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function action(payload: any) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Action failed.");
      await refresh();
      return json;
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); return null; }
    finally { setBusy(false); }
  }

  async function ask() {
    if (!question.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/business/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to answer.");
      setAnswer(json.answer);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to answer."); }
    finally { setBusy(false); }
  }

  const topLeads = useMemo(() => data?.leads?.filter((lead: any) => lead.status !== "CONVERTED").slice(0, 12) || [], [data]);

  function newTask(lead?: any) {
    const title = window.prompt("Task to create", lead ? `Follow up ${lead.name || lead.phone}` : "");
    if (!title) return;
    const assignedTo = window.prompt("Assign to", lead?.assignedTo || teamDirectory[0]?.name || "") || undefined;
    void action({ action: "task", leadId: lead?.id, title, assignedTo });
  }

  function newQuote(lead: any) {
    const service = window.prompt("Service", lead.serviceInterest || lead.packageName || "") || "";
    if (!service) return;
    const amountText = window.prompt("Amount in ZMW (leave blank for tailored quote)", "");
    const details = window.prompt("Quotation details", `${service} for ${lead.name || "client"}`) || "";
    if (!details) return;
    void action({ action: "quote", leadId: lead.id, service, amountZmw: amountText ? Number(amountText) : undefined, details });
  }

  function recordPayment(lead: any) {
    const amount = Number(window.prompt("Amount received in ZMW", ""));
    if (!amount) return;
    const reference = window.prompt("Payment reference / note", "") || undefined;
    const verified = window.confirm("Has this payment been verified?");
    void action({ action: "payment", leadId: lead.id, amountZmw: amount, reference, verified, verifiedBy: "Admin" });
  }

  if (!data) return <main style={{ padding: 28, fontFamily: "system-ui" }}><Link href="/admin">← Agent Admin</Link><h1>Business Intelligence</h1><p>{error || "Loading MedMinds business data..."}</p></main>;

  return <main style={{ minHeight: "100vh", background: "#f4f8f7", color: "#12313b", fontFamily: "system-ui", padding: "22px clamp(14px,3vw,34px)" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 22 }}>
      <div><Link href="/admin" style={{ color: "#087d78", textDecoration: "none", fontWeight: 700 }}>← Agent Admin</Link><h1 style={{ margin: "7px 0 2px" }}>MedMinds Business Intelligence</h1><p style={{ margin: 0, color: "#61736f" }}>Sales, operations, client intelligence and management actions in one place.</p></div>
      <button onClick={() => void refresh()} style={buttonStyle}>Refresh data</button>
    </header>

    <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>{(["overview","leads","operations","intelligence"] as const).map((item) => <button key={item} onClick={() => setView(item)} style={{ ...buttonStyle, background: view === item ? "#0a7d78" : "white", color: view === item ? "white" : "#12313b" }}>{item[0].toUpperCase()+item.slice(1)}</button>)}</nav>
    {error && <div style={{ background: "#fff1f1", color: "#9d2c2c", padding: 12, borderRadius: 12, marginBottom: 14 }}>{error}</div>}

    {view === "overview" && <>
      <section style={metricGrid}>{Object.entries({ "Total leads": data.metrics.totalLeads, "Conversion": `${data.metrics.conversionRate}%`, "Hot leads": data.metrics.hotLeads, "Follow-ups due": data.metrics.followUpsDue, "Payment pending": data.metrics.paymentPending, "Lost leads": data.metrics.lost }).map(([label,value]) => <article key={label} style={card}><small style={{ color: "#61736f" }}>{label}</small><strong style={{ display: "block", fontSize: 28, marginTop: 5 }}>{String(value)}</strong></article>)}</section>
      <section style={twoCol}>
        <article style={card}><h3>Services generating enquiries</h3>{data.services.slice(0,8).map((row:any)=><div key={row.service} style={rowStyle}><span>{row.service}</span><strong>{row.leads} leads · {row.conversionRate}%</strong></div>)}</article>
        <article style={card}><h3>Why leads are being lost</h3>{data.lostReasons.length ? data.lostReasons.slice(0,8).map((row:any)=><div key={row.reason} style={rowStyle}><span>{row.reason}</span><strong>{row.count}</strong></div>) : <p>No lost-lead patterns yet.</p>}</article>
      </section>
      <article style={card}><h3>Google reputation tools</h3><p style={{ color: "#61736f" }}>Use reviews to reassure hesitant clients and request reviews after satisfactory service.</p><div style={{ display:"flex",gap:10,flexWrap:"wrap" }}><a href={reviewsUrl} target="_blank" rel="noreferrer" style={linkButton}>View MedMinds reviews</a><a href={collectReviewUrl} target="_blank" rel="noreferrer" style={linkButton}>Collect a Google review</a></div></article>
    </>}

    {view === "leads" && <section style={{ display: "grid", gap: 10 }}>{topLeads.map((lead:any)=><article key={lead.id} style={{...card,display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:12,alignItems:"center"}}><div><strong>{lead.name || "Unnamed client"}</strong><div style={{color:"#61736f",fontSize:13,marginTop:4}}>{lead.phone} · {lead.serviceInterest || "Service not established"}</div><div style={{marginTop:7}}><b>{lead.scoreBand} {lead.leadScore}/100</b> · {lead.status} · {lead.messageCount} messages{lead.lostReason ? ` · ${lead.lostReason}` : ""}</div><small style={{color:"#82908d"}}>Last: {lead.lastMessage || "No message"}</small></div><div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}><button style={buttonStyle} onClick={()=>newTask(lead)}>Task</button><button style={buttonStyle} onClick={()=>newQuote(lead)}>Quote</button><button style={buttonStyle} onClick={()=>recordPayment(lead)}>Payment</button></div></article>)}</section>}

    {view === "operations" && <section style={twoCol}>
      <article style={card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h3>Tasks</h3><button style={buttonStyle} onClick={()=>newTask()}>+ Task</button></div>{data.tasks.length ? data.tasks.slice(0,20).map((task:any)=><div key={task.id} style={rowStyle}><span>{task.title}<small style={{display:"block",color:"#82908d"}}>{task.assigned_to || "Unassigned"}</small></span><strong>{task.status}</strong></div>) : <p>No tasks yet.</p>}</article>
      <article style={card}><h3>Payments</h3>{data.payments.length ? data.payments.slice(0,20).map((payment:any)=><div key={payment.id} style={rowStyle}><span>K{Number(payment.amount_zmw).toLocaleString()}<small style={{display:"block",color:"#82908d"}}>{payment.reference || "No reference"}</small></span><strong>{payment.status}</strong></div>) : <p>No payment records yet.</p>}<h3 style={{marginTop:24}}>Quotations</h3>{data.quotes.slice(0,12).map((quote:any)=><div key={quote.id} style={rowStyle}><span>{quote.service}<small style={{display:"block",color:"#82908d"}}>{quote.details}</small></span><strong>{quote.amount_zmw == null ? "Tailored" : `K${Number(quote.amount_zmw).toLocaleString()}`}</strong></div>)}</article>
    </section>}

    {view === "intelligence" && <section style={twoCol}>
      <article style={card}><h3>Ask MedMinds business data</h3><textarea value={question} onChange={(e)=>setQuestion(e.target.value)} placeholder="e.g. Which services get the most leads? Why are clients not converting? Which leads need attention?" style={{width:"100%",minHeight:110,padding:12,border:"1px solid #ccd9d5",borderRadius:12,boxSizing:"border-box"}}/><button disabled={busy} onClick={()=>void ask()} style={{...buttonStyle,marginTop:10,background:"#0a7d78",color:"white"}}>{busy?"Analysing...":"Ask"}</button>{answer&&<p style={{background:"#eef7f5",padding:14,borderRadius:12,lineHeight:1.55}}>{answer}</p>}</article>
      <article style={card}><h3>Management focus</h3><p><strong>{data.metrics.hotLeads}</strong> hot unconverted leads should receive priority attention.</p><p><strong>{data.metrics.followUpsDue}</strong> follow-ups are due.</p><p><strong>{data.metrics.paymentPending}</strong> leads are awaiting payment completion.</p><p>Daily management briefs are sent automatically through the existing Vercel cron.</p></article>
    </section>}
  </main>;
}

const card: React.CSSProperties = { background:"white",border:"1px solid #dce7e3",borderRadius:16,padding:16,boxShadow:"0 8px 24px rgba(18,49,59,.05)" };
const metricGrid: React.CSSProperties = { display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:14 };
const twoCol: React.CSSProperties = { display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:14,marginBottom:14 };
const rowStyle: React.CSSProperties = { display:"flex",justifyContent:"space-between",gap:12,padding:"10px 0",borderTop:"1px solid #edf1ef",alignItems:"center" };
const buttonStyle: React.CSSProperties = { border:"1px solid #cbd9d5",background:"white",color:"#12313b",borderRadius:10,padding:"9px 12px",fontWeight:700,cursor:"pointer" };
const linkButton: React.CSSProperties = { ...buttonStyle, display:"inline-block",textDecoration:"none" };
