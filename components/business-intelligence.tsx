"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { teamDirectory } from "@/lib/team-directory";

type Snapshot = any;
type View = "overview" | "leads" | "operations" | "intelligence";
type FormKind = "task" | "quote" | "payment" | null;

const reviewsUrl = "https://maps.app.goo.gl/4kL9cCutoRFFs3aD8";
const collectReviewUrl = "https://share.google/QdIE9kViJz0Igntzb";
const tabs: Array<{ key: View; label: string; hint: string }> = [
  { key: "overview", label: "Overview", hint: "KPIs and priorities" },
  { key: "leads", label: "Leads", hint: "Find and convert" },
  { key: "operations", label: "Operations", hint: "Tasks, payments, quotes" },
  { key: "intelligence", label: "Ask Intelligence", hint: "Query business data" }
];

function fmtDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : value;
}

function clientLabel(row: any) {
  return row.leadName || row.leadPhone || "No client linked";
}

function quoteDelivery(quote: any) {
  const status = String(quote.delivery_status || "NOT_SENT").toUpperCase();
  if (status === "ACCEPTED") return { label: "Submitted", style: pendingPill, pending: true };
  if (status === "SENT") return { label: "Sent", style: pendingPill, pending: true };
  if (status === "DELIVERED") return { label: "Delivered", style: donePill, pending: false };
  if (status === "READ") return { label: "Read", style: donePill, pending: false };
  if (status === "FAILED") return { label: "Failed", style: dangerPill, pending: false };
  return { label: "Not sent", style: statusPill, pending: false };
}

export function BusinessIntelligence() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [band, setBand] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [formKind, setFormKind] = useState<FormKind>(null);
  const [formLead, setFormLead] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  async function refresh(showNotice = false) {
    const response = await fetch("/api/admin/business", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Unable to load Business Intelligence.");
    setData(json);
    if (showNotice) setNotice(`Business data refreshed${json.loadMs != null ? ` in ${json.loadMs} ms` : ""}.`);
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 4200); return () => window.clearTimeout(id); }, [notice]);
  useEffect(() => {
    const pending = (data?.quotes || []).some((quote: any) => quoteDelivery(quote).pending);
    if (!pending) return;
    const id = window.setInterval(() => refresh(false).catch(() => undefined), 4000);
    return () => window.clearInterval(id);
  }, [data?.quotes]);

  async function action(payload: any, success?: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Action failed.");
      await refresh(false);
      if (success) setNotice(success);
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return null;
    } finally { setBusy(false); }
  }

  async function ask() {
    if (!question.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/business/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to answer.");
      setAnswer(json.answer);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to answer."); }
    finally { setBusy(false); }
  }

  function openForm(kind: Exclude<FormKind, null>, lead?: any) {
    setFormKind(kind);
    setFormLead(lead || null);
    setError("");
    if (kind === "task") setForm({ title: lead ? `Follow up ${lead.name || lead.phone}` : "", assignedTo: "", dueAt: "", notes: "" });
    if (kind === "quote") setForm({ service: lead?.serviceInterest || lead?.packageName || "", amountZmw: "", details: "" });
    if (kind === "payment") setForm({ amountZmw: "", reference: "", verified: false });
  }

  async function submitForm() {
    if (!formKind) return;
    if (formKind === "task") {
      if (!form.title?.trim()) return setError("Enter a task title.");
      const result = await action({ action: "task", leadId: formLead?.id, title: form.title.trim(), assignedTo: form.assignedTo || undefined, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined, notes: form.notes || undefined }, "Task created and the appropriate team member was notified.");
      if (result) setFormKind(null);
    }
    if (formKind === "quote") {
      if (!formLead?.id || !form.service?.trim() || !form.details?.trim()) return setError("Service and quotation details are required.");
      const result = await action({ action: "quote", leadId: formLead.id, service: form.service.trim(), amountZmw: form.amountZmw === "" ? undefined : Number(form.amountZmw), details: form.details.trim() });
      if (result) {
        setNotice("Quotation submitted to WhatsApp. Waiting for Meta delivery confirmation.");
        setFormKind(null);
        setView("operations");
        window.setTimeout(() => refresh(false).catch(() => undefined), 1800);
      }
    }
    if (formKind === "payment") {
      if (!formLead?.id || !Number(form.amountZmw)) return setError("Enter a valid payment amount.");
      const result = await action({ action: "payment", leadId: formLead.id, amountZmw: Number(form.amountZmw), reference: form.reference || undefined, verified: Boolean(form.verified), verifiedBy: "Admin" }, form.verified ? "Payment recorded as verified." : "Payment recorded and queued for verification.");
      if (result) setFormKind(null);
    }
  }

  const filteredLeads = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.leads || []).filter((lead: any) => {
      const matchesText = !needle || [lead.name, lead.phone, lead.email, lead.serviceInterest, lead.packageName, lead.institution, lead.programme].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
      return matchesText && (band === "ALL" || lead.scoreBand === band) && (status === "ALL" || lead.status === status);
    });
  }, [data, search, band, status]);

  const statuses = useMemo(() => Array.from(new Set((data?.leads || []).map((lead: any) => String(lead.status)))).sort(), [data]);

  if (!data) return <BusinessLoading error={error} />;

  const metrics = [
    ["Total leads", data.metrics.totalLeads, "All captured enquiries"],
    ["Conversion", `${data.metrics.conversionRate}%`, `${data.metrics.converted} converted`],
    ["Hot leads", data.metrics.hotLeads, "Need priority sales action"],
    ["Follow-ups due", data.metrics.followUpsDue, "Action required"],
    ["Pending payments", data.metrics.paymentPending, "Awaiting verification"],
    ["Open tasks", data.metrics.openTasks ?? 0, `${data.metrics.overdueTasks ?? 0} overdue`]
  ];

  return <main style={shell}>
    <style>{`@media(max-width:720px){.bi-tabs{grid-template-columns:repeat(2,minmax(0,1fr))!important}.bi-lead{grid-template-columns:1fr!important}.bi-actions{justify-content:flex-start!important}.bi-modal{align-items:end!important;padding:0!important}.bi-modal-card{border-radius:22px 22px 0 0!important;max-height:90dvh;overflow:auto}}`}</style>
    <div style={{ maxWidth: 1440, margin: "0 auto" }}>
      <header style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <Link href="/admin" style={backLink}>← Agent Admin</Link>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}><h1 style={{ margin: 0, fontSize: "clamp(25px,3vw,37px)", letterSpacing: "-.035em" }}>Business Intelligence</h1><span style={livePill}>● LIVE</span></div>
          <p style={{ ...muted, margin: "5px 0 0" }}>Sales, operations and client activity in one workspace.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={countPill}>{data.loadMs != null ? `${data.loadMs} ms` : "Live data"}</span><button disabled={busy} onClick={() => void refresh(true)} style={secondaryButton}>{busy ? "Working…" : "↻ Refresh"}</button></div>
      </header>

      {error && <div style={errorBox}>{error}<button onClick={() => setError("")} style={dismissButton}>×</button></div>}
      {notice && <div style={successBox}>{notice}</div>}

      <nav className="bi-tabs" style={tabBar}>{tabs.map((item) => <button key={item.key} onClick={() => setView(item.key)} style={{ ...tabButton, ...(view === item.key ? activeTab : {}) }}><strong>{item.label}</strong><small style={{ display: "block", opacity: .7, marginTop: 2 }}>{item.hint}</small></button>)}</nav>

      {view === "overview" && <>
        <section style={metricGrid}>{metrics.map(([label, value, hint]) => <article key={String(label)} style={metricCard}><span style={eyebrow}>{String(label)}</span><strong style={{ display: "block", fontSize: 30, margin: "7px 0 2px", letterSpacing: "-.03em" }}>{String(value)}</strong><small style={muted}>{String(hint)}</small></article>)}</section>
        <section style={twoCol}>
          <article style={card}><SectionTitle title="Needs attention" subtitle="The business items most likely to need action now" /><AttentionRow label="Hot unconverted leads" value={data.metrics.hotLeads} tone="high" onClick={() => { setBand("HOT"); setStatus("ALL"); setView("leads"); }} /><AttentionRow label="Follow-ups due" value={data.metrics.followUpsDue} tone={data.metrics.followUpsDue ? "high" : "good"} onClick={() => setView("leads")} /><AttentionRow label="Overdue operations tasks" value={data.metrics.overdueTasks ?? 0} tone={data.metrics.overdueTasks ? "high" : "good"} onClick={() => setView("operations")} /><AttentionRow label="Pending payments" value={data.metrics.paymentPending} tone={data.metrics.paymentPending ? "medium" : "good"} onClick={() => setView("operations")} /></article>
          <article style={card}><SectionTitle title="Services generating enquiries" subtitle="Lead volume and observed conversion" />{data.services.length ? data.services.slice(0, 8).map((row: any) => <div key={row.service} style={rowStyle}><div><strong>{row.service}</strong><div style={miniMuted}>{row.leads} lead{row.leads === 1 ? "" : "s"}</div></div><span style={scorePill}>{row.conversionRate}%</span></div>) : <Empty text="No service data yet." />}</article>
        </section>
        <article style={card}><SectionTitle title="Reputation tools" subtitle="Public reviews and review collection" /><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><a href={reviewsUrl} target="_blank" rel="noreferrer" style={linkButton}>View public reviews</a><a href={collectReviewUrl} target="_blank" rel="noreferrer" style={linkButton}>Open review form</a></div></article>
      </>}

      {view === "leads" && <>
        <div style={toolbar}><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client, phone, institution or service…" style={{ ...inputStyle, flex: "1 1 280px" }} /><select value={band} onChange={(e) => setBand(e.target.value)} style={selectStyle}><option value="ALL">All scores</option><option value="HOT">Hot</option><option value="WARM">Warm</option><option value="COLD">Cold</option></select><select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}><option value="ALL">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select><span style={countPill}>{filteredLeads.length} shown</span></div>
        <section style={{ display: "grid", gap: 10 }}>{filteredLeads.length ? filteredLeads.map((lead: any) => <article className="bi-lead" key={lead.id} style={leadCard}><div style={{ minWidth: 0 }}><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong style={{ fontSize: 16 }}>{lead.name || "Unnamed client"}</strong><span style={bandPill(lead.scoreBand)}>{lead.scoreBand} {lead.leadScore}/100</span><span style={statusPill}>{lead.status}</span></div><div style={{ ...miniMuted, marginTop: 7 }}>{lead.phone} · {lead.serviceInterest || lead.packageName || "Service not established"}</div><div style={{ ...miniMuted, marginTop: 3 }}>{lead.institution || "Institution not provided"} · Last active {lead.inactiveDays ?? 0} day{lead.inactiveDays === 1 ? "" : "s"} ago</div>{lead.lastMessage && <div style={messagePreview}>“{lead.lastMessage}”</div>}</div><div className="bi-actions" style={actionGroup}><button style={smallButton} onClick={() => openForm("task", lead)}>+ Task</button><button style={smallButton} onClick={() => openForm("quote", lead)}>Quotation</button><button style={primarySmallButton} onClick={() => openForm("payment", lead)}>Payment</button>{lead.status === "CONVERTED" && <button style={smallButton} disabled={busy} onClick={() => void action({ action: "review_request", leadId: lead.id }, "Review request sent.")}>Request review</button>}</div></article>) : <article style={card}><Empty text="No leads match these filters." /></article>}</section>
      </>}

      {view === "operations" && <section style={twoCol}>
        <article style={card}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}><SectionTitle title="Tasks" subtitle="Create, track and close internal work" /><button style={primarySmallButton} onClick={() => openForm("task")}>+ Task</button></div>{data.tasks.length ? data.tasks.slice(0, 40).map((task: any) => <div key={task.id} style={operationRow}><div><strong>{task.title}</strong><div style={miniMuted}>{clientLabel(task)} · {task.assigned_to || "Unassigned"}</div></div><div style={actionGroup}><span style={task.status === "COMPLETED" ? donePill : statusPill}>{task.status}</span>{task.status !== "COMPLETED" && <button disabled={busy} style={smallButton} onClick={() => void action({ action: "task_status", taskId: task.id, status: "COMPLETED" }, "Task marked complete.")}>Complete</button>}</div></div>) : <Empty text="No internal tasks yet." />}</article>
        <article style={card}><SectionTitle title="Payments & quotations" subtitle="Commercial records with real WhatsApp delivery state" />{data.payments.length ? data.payments.slice(0, 25).map((payment: any) => <div key={payment.id} style={operationRow}><div><strong>K{Number(payment.amount_zmw).toLocaleString()}</strong><div style={miniMuted}>{clientLabel(payment)}</div></div><div style={actionGroup}><span style={payment.status === "VERIFIED" ? donePill : warningPill}>{payment.status}</span>{payment.status === "PENDING" && <button disabled={busy} style={primarySmallButton} onClick={() => void action({ action: "verify_payment", paymentId: payment.id, verifiedBy: "Admin" }, "Payment verified.")}>Verify</button>}</div></div>) : null}
          <h3 style={{ margin: "26px 0 4px" }}>Quotations</h3><p style={{ ...miniMuted, marginTop: 0 }}><strong>Submitted</strong> means Meta accepted the request. <strong>Delivered</strong> confirms it reached the client device.</p>
          {data.quotes.length ? data.quotes.slice(0, 30).map((quote: any) => { const delivery = quoteDelivery(quote); return <div key={quote.id} style={{ ...operationRow, alignItems: "flex-start" }}><div style={{ minWidth: 0, flex: "1 1 240px" }}><strong>{quote.service}</strong><div style={miniMuted}>{clientLabel(quote)} · {quote.amount_zmw == null ? "Tailored" : `K${Number(quote.amount_zmw).toLocaleString()}`}</div><div style={{ ...miniMuted, marginTop: 3 }}>{quote.details}</div>{quote.delivery_error && <div style={{ ...miniMuted, color: "#a13c3c", marginTop: 5 }}>{quote.delivery_error}</div>}</div><div className="bi-actions" style={{ ...actionGroup, justifyContent: "flex-end" }}><span style={delivery.style}>{delivery.label}</span><button disabled={busy} style={smallButton} onClick={() => void action({ action: "resend_quote", quoteId: quote.id }, "Quotation resubmitted to WhatsApp. Waiting for delivery confirmation.")}>Resend</button></div></div>; }) : <Empty text="No quotations yet." />}</article>
      </section>}

      {view === "intelligence" && <section style={twoCol}><article style={card}><SectionTitle title="Ask MedMinds business data" subtitle="Answers are generated from the current business dataset" /><textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Which leads need attention? Why are clients not converting?" style={textareaStyle} /><button disabled={busy || !question.trim()} onClick={() => void ask()} style={{ ...primaryButton, marginTop: 12 }}>{busy ? "Analysing…" : "Ask Intelligence"}</button>{answer && <div style={answerBox}>{answer}</div>}</article><article style={card}><SectionTitle title="Management focus" subtitle={`Snapshot updated ${fmtDate(data.generatedAt)}`} /><Focus value={data.metrics.hotLeads} label="hot unconverted leads" /><Focus value={data.metrics.followUpsDue} label="follow-ups due" /><Focus value={data.metrics.paymentPending} label="pending payment records" /><Focus value={data.metrics.overdueTasks ?? 0} label="overdue operations tasks" /></article></section>}
    </div>

    {formKind && <div className="bi-modal" style={modalBackdrop} onMouseDown={(e) => { if (e.currentTarget === e.target && !busy) setFormKind(null); }}><div className="bi-modal-card" style={modalCard}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><span style={eyebrow}>{formKind === "task" ? "Operations" : formKind === "quote" ? "Sales" : "Finance"}</span><h2 style={{ margin: "5px 0" }}>{formKind === "task" ? "Create task" : formKind === "quote" ? "Send quotation" : "Record payment"}</h2>{formLead && <p style={{ ...miniMuted, margin: 0 }}>{formLead.name || formLead.phone} · {formLead.phone}</p>}</div><button disabled={busy} onClick={() => setFormKind(null)} style={closeButton}>×</button></div><div style={{ display: "grid", gap: 12, marginTop: 20 }}>
      {formKind === "task" && <><Field label="Task title"><input style={inputStyle} value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field><Field label="Assign to"><select style={inputStyle} value={form.assignedTo || ""} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}><option value="">Leave unassigned</option>{teamDirectory.map((person) => <option key={person.name} value={person.name}>{person.name}</option>)}</select></Field><Field label="Due date/time"><input type="datetime-local" style={inputStyle} value={form.dueAt || ""} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></Field><Field label="Notes"><textarea style={textareaStyle} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></>}
      {formKind === "quote" && <><Field label="Service"><input style={inputStyle} value={form.service || ""} onChange={(e) => setForm({ ...form, service: e.target.value })} /></Field><Field label="Amount (ZMW)"><input type="number" min="0" style={inputStyle} placeholder="Leave blank for tailored quotation" value={form.amountZmw ?? ""} onChange={(e) => setForm({ ...form, amountZmw: e.target.value })} /></Field><Field label="Quotation details"><textarea style={textareaStyle} value={form.details || ""} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field><div style={infoBox}>The quotation appears in the client chat immediately. Its status changes from Submitted to Delivered only when Meta confirms delivery.</div></>}
      {formKind === "payment" && <><Field label="Amount received (ZMW)"><input type="number" min="0" step="0.01" style={inputStyle} value={form.amountZmw ?? ""} onChange={(e) => setForm({ ...form, amountZmw: e.target.value })} /></Field><Field label="Reference / note"><input style={inputStyle} value={form.reference || ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field><label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={Boolean(form.verified)} onChange={(e) => setForm({ ...form, verified: e.target.checked })} /> Payment has already been independently verified</label></>}
    </div><div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 20 }}><button disabled={busy} style={secondaryButton} onClick={() => setFormKind(null)}>Cancel</button><button disabled={busy} style={primaryButton} onClick={() => void submitForm()}>{busy ? "Working…" : formKind === "quote" ? "Send quotation" : "Save"}</button></div></div></div>}
  </main>;
}

function BusinessLoading({ error }: { error: string }) {
  return <main style={shell}><style>{`@keyframes biPulse{0%,100%{opacity:.45}50%{opacity:1}}@keyframes biSpin{to{transform:rotate(360deg)}}`}</style><div style={{ maxWidth: 1180, margin: "0 auto" }}><Link href="/admin" style={backLink}>← Agent Admin</Link><div style={{ display: "flex", gap: 12, alignItems: "center", margin: "20px 0" }}><span style={{ width: 32, height: 32, borderRadius: 99, border: "3px solid #cce2de", borderTopColor: "#087d78", animation: "biSpin .8s linear infinite" }} /><div><h1 style={{ margin: 0, fontSize: 30 }}>Business Intelligence</h1><p style={{ ...muted, margin: "4px 0" }}>{error || "Preparing your live workspace…"}</p></div></div><section style={metricGrid}>{Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ ...metricCard, animation: "biPulse 1.35s ease-in-out infinite", animationDelay: `${i * 80}ms`, background: "#fff" }} />)}</section><section style={twoCol}><div style={{ ...card, minHeight: 220, animation: "biPulse 1.35s ease-in-out infinite" }} /><div style={{ ...card, minHeight: 220, animation: "biPulse 1.35s ease-in-out infinite", animationDelay: "120ms" }} /></section></div></main>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div style={{ marginBottom: 14 }}><h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3><p style={{ ...miniMuted, margin: "4px 0 0" }}>{subtitle}</p></div>; }
function Empty({ text }: { text: string }) { return <div style={{ padding: "24px 4px", color: "#71827e", textAlign: "center" }}>{text}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 750 }}>{label}{children}</label>; }
function Focus({ value, label }: { value: number; label: string }) { return <div style={{ ...rowStyle, alignItems: "baseline" }}><strong style={{ fontSize: 24 }}>{value}</strong><span style={muted}>{label}</span></div>; }
function AttentionRow({ label, value, tone, onClick }: { label: string; value: number; tone: "high" | "medium" | "good"; onClick: () => void }) { const pill = tone === "high" ? dangerPill : tone === "medium" ? warningPill : donePill; return <button onClick={onClick} style={attentionButton}><span>{label}</span><span style={pill}>{value}</span></button>; }

const shell: CSSProperties = { minHeight: "100vh", background: "linear-gradient(180deg,#f4f8f7 0%,#eef5f3 100%)", color: "#12313b", fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding: "clamp(14px,2.4vw,30px)" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 20 };
const card: CSSProperties = { background: "rgba(255,255,255,.96)", border: "1px solid #d9e5e1", borderRadius: 18, padding: "clamp(15px,2vw,20px)", boxShadow: "0 10px 30px rgba(18,49,59,.055)" };
const metricCard: CSSProperties = { ...card, minHeight: 112 };
const metricGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 11, marginBottom: 14 };
const twoCol: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 14, marginBottom: 14 };
const rowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 0", borderTop: "1px solid #edf2f0", alignItems: "center", flexWrap: "wrap" };
const operationRow: CSSProperties = { ...rowStyle, alignItems: "center" };
const leadCard: CSSProperties = { ...card, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 14, alignItems: "center" };
const actionGroup: CSSProperties = { display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" };
const muted: CSSProperties = { color: "#61736f" };
const miniMuted: CSSProperties = { color: "#71827e", fontSize: 12.5, lineHeight: 1.45 };
const eyebrow: CSSProperties = { color: "#5f746e", fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" };
const backLink: CSSProperties = { color: "#087d78", textDecoration: "none", fontWeight: 750, fontSize: 13 };
const buttonBase: CSSProperties = { borderRadius: 11, padding: "10px 13px", fontWeight: 750, cursor: "pointer", minHeight: 40 };
const primaryButton: CSSProperties = { ...buttonBase, border: "1px solid #087d78", background: "#087d78", color: "white" };
const secondaryButton: CSSProperties = { ...buttonBase, border: "1px solid #c8d7d3", background: "white", color: "#12313b" };
const smallButton: CSSProperties = { ...secondaryButton, minHeight: 34, padding: "7px 10px", fontSize: 12.5 };
const primarySmallButton: CSSProperties = { ...primaryButton, minHeight: 34, padding: "7px 10px", fontSize: 12.5 };
const linkButton: CSSProperties = { ...secondaryButton, display: "inline-flex", alignItems: "center", textDecoration: "none" };
const inputStyle: CSSProperties = { width: "100%", minHeight: 42, padding: "9px 11px", border: "1px solid #cbd9d5", borderRadius: 11, boxSizing: "border-box", background: "white", color: "#12313b", fontSize: 14 };
const selectStyle: CSSProperties = { ...inputStyle, width: "auto", minWidth: 135 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 110, resize: "vertical" };
const toolbar: CSSProperties = { ...card, padding: 12, marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const tabBar: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginBottom: 16 };
const tabButton: CSSProperties = { border: "1px solid #d4e1dd", background: "rgba(255,255,255,.8)", color: "#29454d", borderRadius: 13, padding: "10px 12px", textAlign: "left", cursor: "pointer" };
const activeTab: CSSProperties = { background: "#123f4d", borderColor: "#123f4d", color: "white", boxShadow: "0 8px 20px rgba(18,63,77,.14)" };
const livePill: CSSProperties = { borderRadius: 999, background: "#e7f7f1", color: "#13765d", padding: "4px 8px", fontSize: 10.5, fontWeight: 900, letterSpacing: ".05em" };
const countPill: CSSProperties = { borderRadius: 999, background: "#edf3f1", padding: "7px 10px", fontSize: 12, fontWeight: 750, color: "#536a64" };
const scorePill: CSSProperties = { borderRadius: 999, background: "#e8f4f2", padding: "5px 8px", color: "#087d78", fontWeight: 800, fontSize: 12 };
const statusPill: CSSProperties = { borderRadius: 999, background: "#edf2f5", padding: "5px 8px", color: "#50636b", fontWeight: 800, fontSize: 11 };
const donePill: CSSProperties = { ...statusPill, background: "#e7f7ee", color: "#20724b" };
const warningPill: CSSProperties = { ...statusPill, background: "#fff5dc", color: "#8a6419" };
const pendingPill: CSSProperties = { ...statusPill, background: "#fff1cf", color: "#806014" };
const dangerPill: CSSProperties = { ...statusPill, background: "#feeaea", color: "#a13c3c" };
const bandPill = (value: string): CSSProperties => value === "HOT" ? dangerPill : value === "WARM" ? warningPill : statusPill;
const messagePreview: CSSProperties = { marginTop: 8, padding: "8px 10px", background: "#f5f8f7", borderRadius: 10, color: "#526762", fontSize: 12.5, lineHeight: 1.45, overflowWrap: "anywhere" };
const errorBox: CSSProperties = { position: "relative", background: "#fff0f0", color: "#9d2c2c", padding: "12px 42px 12px 13px", border: "1px solid #f0cccc", borderRadius: 12, marginBottom: 12 };
const successBox: CSSProperties = { background: "#eaf8f1", color: "#226849", padding: 12, border: "1px solid #c9ead9", borderRadius: 12, marginBottom: 12 };
const dismissButton: CSSProperties = { position: "absolute", right: 8, top: 5, border: 0, background: "transparent", color: "inherit", fontSize: 22, cursor: "pointer" };
const answerBox: CSSProperties = { background: "#eef7f5", border: "1px solid #d5e9e4", padding: 14, borderRadius: 12, lineHeight: 1.6, marginTop: 14, whiteSpace: "pre-wrap" };
const attentionButton: CSSProperties = { ...rowStyle, width: "100%", background: "transparent", color: "#12313b", borderLeft: 0, borderRight: 0, borderBottom: 0, cursor: "pointer", textAlign: "left", font: "inherit" };
const infoBox: CSSProperties = { background: "#eef7f5", color: "#43635d", border: "1px solid #d5e9e4", padding: 10, borderRadius: 11, fontSize: 12.5, lineHeight: 1.45 };
const modalBackdrop: CSSProperties = { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(10,31,39,.46)", display: "grid", placeItems: "center", padding: 14, overflowY: "auto" };
const modalCard: CSSProperties = { ...card, width: "min(100%,580px)", boxShadow: "0 30px 80px rgba(8,29,37,.28)" };
const closeButton: CSSProperties = { width: 38, height: 38, borderRadius: 999, border: "1px solid #d6e1de", background: "white", color: "#50645f", fontSize: 22, cursor: "pointer" };
