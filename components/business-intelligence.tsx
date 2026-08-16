"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { teamDirectory } from "@/lib/team-directory";

type Snapshot = any;
type View = "overview" | "leads" | "operations" | "intelligence";
type FormKind = "task" | "quote" | "payment" | null;

const reviewsUrl = "https://maps.app.goo.gl/4kL9cCutoRFFs3aD8";
const collectReviewUrl = "https://share.google/QdIE9kViJz0Igntzb";
const tabs: Array<{ key: View; label: string; hint: string }> = [
  { key: "overview", label: "Command centre", hint: "KPIs and priorities" },
  { key: "leads", label: "Leads", hint: "Score and convert" },
  { key: "operations", label: "Operations", hint: "Tasks, payments, quotes" },
  { key: "intelligence", label: "Ask Intelligence", hint: "Query business data" }
];

function fmtDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : value;
}

function clientLabel(row: any) {
  return row.leadName || row.leadPhone || row.source_client || "No client linked";
}

function taskPriorityStyle(priority?: string): React.CSSProperties {
  const value = String(priority || "standard").toLowerCase();
  if (value === "urgent") return dangerPill;
  if (value === "high") return warningPill;
  if (value === "low") return donePill;
  return statusPill;
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
    if (!response.ok) throw new Error(json.error || "Unable to load business intelligence.");
    setData(json);
    if (showNotice) setNotice("Business data refreshed.");
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 3200); return () => window.clearTimeout(id); }, [notice]);

  async function action(payload: any, success?: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Action failed.");
      await refresh();
      if (success) setNotice(success);
      return json;
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); return null; }
    finally { setBusy(false); }
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
    if (kind === "task") setForm({ title: lead ? `Follow up ${lead.name || lead.phone}` : "", assignedTo: "", dueAt: "", notes: "", priority: "standard" });
    if (kind === "quote") setForm({ service: lead?.serviceInterest || lead?.packageName || "", amountZmw: "", details: "" });
    if (kind === "payment") setForm({ amountZmw: "", reference: "", verified: false });
  }

  async function submitForm() {
    if (!formKind) return;
    if (formKind === "task") {
      if (!form.title?.trim()) return setError("Enter a task title.");
      const dueAt = form.dueAt ? new Date(form.dueAt).toISOString() : undefined;
      const result = await action({ action: "task", leadId: formLead?.id, title: form.title.trim(), assignedTo: form.assignedTo || undefined, dueAt, notes: form.notes || undefined, priority: form.priority || "standard" }, "Task created in Business Intelligence and the Research Portal.");
      if (result) setFormKind(null);
    }
    if (formKind === "quote") {
      if (!formLead?.id || !form.service?.trim() || !form.details?.trim()) return setError("Service and quotation details are required.");
      const result = await action({ action: "quote", leadId: formLead.id, service: form.service.trim(), amountZmw: form.amountZmw === "" ? undefined : Number(form.amountZmw), details: form.details.trim() }, "Quotation saved and routed for sales visibility.");
      if (result) {
        const text = `MedMinds quotation\nClient: ${formLead.name || formLead.phone}\nService: ${form.service}\nAmount: ${form.amountZmw === "" ? "Tailored quotation" : `K${Number(form.amountZmw).toLocaleString()}`}\nDetails: ${form.details}`;
        await navigator.clipboard?.writeText(text).catch(() => undefined);
        setNotice("Quotation saved. A ready-to-send copy is on your clipboard.");
        setFormKind(null);
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
      const matchesBand = band === "ALL" || lead.scoreBand === band;
      const matchesStatus = status === "ALL" || lead.status === status;
      return matchesText && matchesBand && matchesStatus;
    });
  }, [data, search, band, status]);

  const statuses = useMemo(() => Array.from(new Set((data?.leads || []).map((lead: any) => lead.status))).sort(), [data]);

  if (!data) return <main style={shell}><div style={{ maxWidth: 620, margin: "70px auto", ...card }}><Link href="/admin" style={backLink}>← Agent Admin</Link><h1 style={{ marginBottom: 8 }}>Business Intelligence</h1><p style={muted}>{error || "Loading MedMinds business data…"}</p></div></main>;

  const metrics = [
    ["Total leads", data.metrics.totalLeads, "All captured enquiries"],
    ["Conversion", `${data.metrics.conversionRate}%`, `${data.metrics.converted} converted`],
    ["Hot leads", data.metrics.hotLeads, "Need priority sales action"],
    ["Follow-ups due", data.metrics.followUpsDue, "Action required"],
    ["Pending payments", data.metrics.paymentPending, "Records awaiting verification"],
    ["Open tasks", data.metrics.openTasks ?? 0, `${data.metrics.overdueTasks ?? 0} overdue`]
  ];

  return <main style={shell}>
    <div style={{ maxWidth: 1440, margin: "0 auto" }}>
      <header style={headerStyle}>
        <div style={{ minWidth: 0 }}><Link href="/admin" style={backLink}>← Agent Admin</Link><div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}><h1 style={{ margin: 0, fontSize: "clamp(24px,3vw,36px)", letterSpacing: "-.03em" }}>Business Intelligence</h1><span style={livePill}>● LIVE</span></div><p style={{ ...muted, margin: "5px 0 0" }}>One place to monitor demand, prioritise leads and execute sales and operations actions.</p></div>
        <button disabled={busy} onClick={() => void refresh(true)} style={secondaryButton}>{busy ? "Working…" : "↻ Refresh"}</button>
      </header>

      {error && <div style={errorBox}>{error}<button onClick={() => setError("")} style={dismissButton}>×</button></div>}
      {notice && <div style={successBox}>{notice}</div>}

      <nav style={tabBar}>{tabs.map((item) => <button key={item.key} onClick={() => setView(item.key)} style={{ ...tabButton, ...(view === item.key ? activeTab : {}) }}><strong>{item.label}</strong><small style={{ display: "block", opacity: .7, marginTop: 2 }}>{item.hint}</small></button>)}</nav>

      {view === "overview" && <>
        <section style={metricGrid}>{metrics.map(([label, value, hint]) => <article key={String(label)} style={metricCard}><span style={eyebrow}>{String(label)}</span><strong style={{ display: "block", fontSize: 30, margin: "7px 0 2px", letterSpacing: "-.03em" }}>{String(value)}</strong><small style={muted}>{String(hint)}</small></article>)}</section>

        <section style={twoCol}>
          <article style={card}><SectionTitle title="Action queue" subtitle="The items most likely to need attention now" />
            <AttentionRow label="Hot unconverted leads" value={data.metrics.hotLeads} tone="high" onClick={() => { setBand("HOT"); setStatus("ALL"); setView("leads"); }} />
            <AttentionRow label="Follow-ups due" value={data.metrics.followUpsDue} tone={data.metrics.followUpsDue ? "high" : "good"} onClick={() => setView("leads")} />
            <AttentionRow label="Overdue operations tasks" value={data.metrics.overdueTasks ?? 0} tone={data.metrics.overdueTasks ? "high" : "good"} onClick={() => setView("operations")} />
            <AttentionRow label="Pending payment records" value={data.metrics.paymentPending} tone={data.metrics.paymentPending ? "medium" : "good"} onClick={() => setView("operations")} />
            <AttentionRow label="Warm leads inactive ≥3 days" value={data.metrics.staleWarmLeads ?? 0} tone={data.metrics.staleWarmLeads ? "medium" : "good"} onClick={() => setView("leads")} />
          </article>
          <article style={card}><SectionTitle title="Services generating enquiries" subtitle="Lead volume and observed conversion" />{data.services.length ? data.services.slice(0, 8).map((row: any) => <div key={row.service} style={rowStyle}><div style={{ minWidth: 0 }}><strong>{row.service}</strong><div style={miniMuted}>{row.leads} lead{row.leads === 1 ? "" : "s"}</div></div><span style={scorePill}>{row.conversionRate}%</span></div>) : <Empty text="No service data yet." />}</article>
        </section>

        <section style={twoCol}>
          <article style={card}><SectionTitle title="Why leads are being lost" subtitle="Signals derived from actual conversations" />{data.lostReasons.length ? data.lostReasons.slice(0, 8).map((row: any) => <div key={row.reason} style={rowStyle}><span>{row.reason}</span><strong>{row.count}</strong></div>) : <Empty text="No lost-lead pattern has been established yet." />}</article>
          <article style={card}><SectionTitle title="Feature audit" subtitle="Operational status of the Intelligence workflows" />
            <Feature name="Lead scoring & prioritisation" detail={`${data.metrics.hotLeads} hot leads identified`} ok />
            <Feature name="Follow-up monitoring" detail={`${data.metrics.followUpsDue} currently due`} ok />
            <Feature name="Task workflow" detail={`${data.metrics.openTasks ?? 0} open · completion enabled`} ok />
            <Feature name="Payment workflow" detail={`${data.metrics.paymentPending} pending · verification enabled`} ok />
            <Feature name="Quotation workflow" detail={`${data.metrics.quotesCreated ?? data.quotes.length} stored`} ok />
            <Feature name="WhatsApp event routing" detail="Important business events route by staff role" ok />
            <Feature name="Research Portal bridge" detail="Bidirectional task creation sync with duplicate protection" ok />
            <Feature name="Daily management brief" detail="Runs with the daily follow-up cron" ok />
          </article>
        </section>

        <article style={card}><SectionTitle title="Reputation tools" subtitle="Use social proof when credibility is genuinely relevant; request reviews after satisfactory service" /><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><a href={reviewsUrl} target="_blank" rel="noreferrer" style={linkButton}>View public reviews</a><a href={collectReviewUrl} target="_blank" rel="noreferrer" style={linkButton}>Open review form</a></div></article>
      </>}

      {view === "leads" && <>
        <div style={toolbar}><div style={{ flex: "1 1 280px" }}><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, institution, service…" style={inputStyle} /></div><select value={band} onChange={(e) => setBand(e.target.value)} style={selectStyle}><option value="ALL">All scores</option><option value="HOT">Hot</option><option value="WARM">Warm</option><option value="COLD">Cold</option></select><select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}><option value="ALL">All statuses</option>{statuses.map((item: any) => <option key={item} value={item}>{item}</option>)}</select><span style={countPill}>{filteredLeads.length} shown</span></div>
        <section style={{ display: "grid", gap: 10 }}>{filteredLeads.length ? filteredLeads.map((lead: any) => <article key={lead.id} style={leadCard}>
          <div style={{ minWidth: 0 }}><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong style={{ fontSize: 16 }}>{lead.name || "Unnamed client"}</strong><span style={bandPill(lead.scoreBand)}>{lead.scoreBand} {lead.leadScore}/100</span><span style={statusPill}>{lead.status}</span></div><div style={{ ...miniMuted, marginTop: 7 }}>{lead.phone} · {lead.serviceInterest || lead.packageName || "Service not established"}</div><div style={{ ...miniMuted, marginTop: 3 }}>{lead.institution || "Institution not provided"}{lead.programme ? ` · ${lead.programme}` : ""} · Last active {lead.inactiveDays ?? 0} day{lead.inactiveDays === 1 ? "" : "s"} ago</div>{lead.lastMessage && <div style={messagePreview}>“{lead.lastMessage}”</div>}{lead.lostReason && <div style={{ ...miniMuted, color: "#9a5b18", marginTop: 6 }}>Lost signal: {lead.lostReason}</div>}</div>
          <div style={actionGroup}><button style={smallButton} onClick={() => openForm("task", lead)}>+ Task</button><button style={smallButton} onClick={() => openForm("quote", lead)}>Quote</button><button style={primarySmallButton} onClick={() => openForm("payment", lead)}>Payment</button>{lead.status === "CONVERTED" && <button style={smallButton} disabled={busy} onClick={() => void action({ action: "review_request", leadId: lead.id }, "Review request sent.")}>Request review</button>}</div>
        </article>) : <article style={card}><Empty text="No leads match these filters." /></article>}</section>
      </>}

      {view === "operations" && <section style={twoCol}>
        <article style={card}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}><SectionTitle title="Tasks" subtitle="Synchronized task structure across Business Intelligence and the Research Portal" /><button style={primaryButton} onClick={() => openForm("task")}>+ New task</button></div>{data.tasks.length ? data.tasks.slice(0, 40).map((task: any) => <div key={task.id} style={operationRow}><div style={{ minWidth: 0, flex: "1 1 260px" }}><div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}><strong>{task.title}</strong><span style={taskPriorityStyle(task.priority)}>{String(task.priority || "standard").toUpperCase()}</span>{task.source === "research-portal" && <span style={scorePill}>Research Portal</span>}</div><div style={miniMuted}>{clientLabel(task)} · {task.assigned_to || "Unassigned"}</div>{(task.program || task.academic_level) && <div style={miniMuted}>{[task.program, task.academic_level].filter(Boolean).join(" · ")}</div>}<div style={miniMuted}>{task.due_at ? `Due ${fmtDate(task.due_at)}` : "No deadline"}</div>{task.notes && <div style={messagePreview}>{task.notes}</div>}</div><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}><span style={task.status === "COMPLETED" ? donePill : statusPill}>{task.status}</span>{task.status !== "COMPLETED" && <button disabled={busy} style={smallButton} onClick={() => void action({ action: "task_status", taskId: task.id, status: "COMPLETED" }, "Task marked complete.")}>Complete</button>}</div></div>) : <Empty text="No internal tasks yet." />}</article>

        <article style={card}><SectionTitle title="Payments" subtitle="Verification status and receipt references" />{data.payments.length ? data.payments.slice(0, 40).map((payment: any) => <div key={payment.id} style={operationRow}><div><strong>K{Number(payment.amount_zmw).toLocaleString()}</strong><div style={miniMuted}>{clientLabel(payment)}</div><div style={miniMuted}>{payment.reference || "No reference"} · MM-{String(payment.id).slice(0, 8).toUpperCase()}</div></div><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}><span style={payment.status === "VERIFIED" ? donePill : warningPill}>{payment.status}</span>{payment.status === "PENDING" && <button disabled={busy} style={primarySmallButton} onClick={() => void action({ action: "verify_payment", paymentId: payment.id, verifiedBy: "Admin" }, "Payment verified and the team was notified.")}>Verify</button>}</div></div>) : <Empty text="No payment records yet." />}
          <h3 style={{ margin: "28px 0 4px" }}>Quotations</h3><p style={{ ...miniMuted, marginTop: 0 }}>Saved quotations remain linked to the originating lead.</p>{data.quotes.length ? data.quotes.slice(0, 30).map((quote: any) => <div key={quote.id} style={operationRow}><div style={{ minWidth: 0 }}><strong>{quote.service}</strong><div style={miniMuted}>{clientLabel(quote)}</div><div style={miniMuted}>{quote.details}</div></div><strong style={{ whiteSpace: "nowrap" }}>{quote.amount_zmw == null ? "Tailored" : `K${Number(quote.amount_zmw).toLocaleString()}`}</strong></div>) : <Empty text="No quotations yet." />}</article>
      </section>}

      {view === "intelligence" && <section style={twoCol}>
        <article style={card}><SectionTitle title="Ask MedMinds business data" subtitle="Answers are generated from the current business dataset, not generic advice" /><textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Which services generate the most leads? Why are clients not converting? Which leads need attention?" style={textareaStyle} /><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>{["Which leads need attention?", "Why are leads being lost?", "Which services perform best?", "What payments are pending?"].map((q) => <button key={q} style={chipButton} onClick={() => setQuestion(q)}>{q}</button>)}</div><button disabled={busy || !question.trim()} onClick={() => void ask()} style={{ ...primaryButton, marginTop: 12 }}>{busy ? "Analysing…" : "Ask Intelligence"}</button>{answer && <div style={answerBox}>{answer}</div>}</article>
        <article style={card}><SectionTitle title="Management focus" subtitle={`Snapshot updated ${fmtDate(data.generatedAt)}`} /><Focus value={data.metrics.hotLeads} label="hot unconverted leads" /><Focus value={data.metrics.followUpsDue} label="follow-ups due" /><Focus value={data.metrics.paymentPending} label="pending payment records" /><Focus value={data.metrics.overdueTasks ?? 0} label="overdue operations tasks" /><p style={{ ...miniMuted, marginTop: 20 }}>The daily management brief is sent through the scheduled follow-up job. Important events are additionally routed to the appropriate staff members by WhatsApp.</p></article>
      </section>}
    </div>

    {formKind && <div style={modalBackdrop} onMouseDown={(e) => { if (e.currentTarget === e.target && !busy) setFormKind(null); }}><div style={modalCard}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}><div><span style={eyebrow}>{formKind === "task" ? "Operations" : formKind === "quote" ? "Sales" : "Finance"}</span><h2 style={{ margin: "5px 0" }}>{formKind === "task" ? "Create task" : formKind === "quote" ? "Create quotation" : "Record payment"}</h2>{formLead && <p style={{ ...miniMuted, margin: 0 }}>{formLead.name || formLead.phone} · {formLead.phone}</p>}</div><button disabled={busy} onClick={() => setFormKind(null)} style={closeButton}>×</button></div>
          <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
            {formKind === "task" && <><Field label="Task title"><input style={inputStyle} value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field><Field label="Priority"><select style={inputStyle} value={form.priority || "standard"} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="standard">Standard</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field><Field label="Assign to"><select style={inputStyle} value={form.assignedTo || ""} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}><option value="">Leave unassigned</option>{teamDirectory.map((person) => <option key={person.name} value={person.name}>{person.name}</option>)}</select></Field><Field label="Due date/time"><input type="datetime-local" style={inputStyle} value={form.dueAt || ""} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></Field><Field label="Notes / instructions"><textarea style={textareaStyle} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></>}
            {formKind === "quote" && <><Field label="Service"><input style={inputStyle} value={form.service || ""} onChange={(e) => setForm({ ...form, service: e.target.value })} /></Field><Field label="Amount (ZMW)"><input type="number" min="0" style={inputStyle} placeholder="Leave blank for tailored quotation" value={form.amountZmw ?? ""} onChange={(e) => setForm({ ...form, amountZmw: e.target.value })} /></Field><Field label="Quotation details"><textarea style={textareaStyle} value={form.details || ""} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field></>}
            {formKind === "payment" && <><Field label="Amount received (ZMW)"><input type="number" min="0" step="0.01" style={inputStyle} value={form.amountZmw ?? ""} onChange={(e) => setForm({ ...form, amountZmw: e.target.value })} /></Field><Field label="Reference / note"><input style={inputStyle} value={form.reference || ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field><label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 700 }}><input type="checkbox" checked={Boolean(form.verified)} onChange={(e) => setForm({ ...form, verified: e.target.checked })} /> Payment has already been independently verified</label></>}
          </div><div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 20, flexWrap: "wrap" }}><button disabled={busy} style={secondaryButton} onClick={() => setFormKind(null)}>Cancel</button><button disabled={busy} style={primaryButton} onClick={() => void submitForm()}>{busy ? "Saving…" : "Save"}</button></div></div></div>}
  </main>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div style={{ marginBottom: 14 }}><h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3><p style={{ ...miniMuted, margin: "4px 0 0" }}>{subtitle}</p></div>; }
function Empty({ text }: { text: string }) { return <div style={{ padding: "24px 4px", color: "#71827e", textAlign: "center" }}>{text}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 750 }}>{label}{children}</label>; }
function Focus({ value, label }: { value: number; label: string }) { return <div style={{ ...rowStyle, alignItems: "baseline" }}><strong style={{ fontSize: 24 }}>{value}</strong><span style={muted}>{label}</span></div>; }
function Feature({ name, detail, ok }: { name: string; detail: string; ok: boolean }) { return <div style={rowStyle}><div><strong>{name}</strong><div style={miniMuted}>{detail}</div></div><span style={ok ? donePill : warningPill}>{ok ? "Ready" : "Check"}</span></div>; }
function AttentionRow({ label, value, tone, onClick }: { label: string; value: number; tone: "high" | "medium" | "good"; onClick: () => void }) { const pill = tone === "high" ? dangerPill : tone === "medium" ? warningPill : donePill; return <button onClick={onClick} style={attentionButton}><span>{label}</span><span style={pill}>{value}</span></button>; }

const shell: React.CSSProperties = { minHeight: "100vh", background: "linear-gradient(180deg,#f4f8f7 0%,#eef5f3 100%)", color: "#12313b", fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding: "clamp(14px,2.4vw,30px)" };
const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 20 };
const card: React.CSSProperties = { background: "rgba(255,255,255,.96)", border: "1px solid #d9e5e1", borderRadius: 18, padding: "clamp(15px,2vw,20px)", boxShadow: "0 10px 30px rgba(18,49,59,.055)" };
const metricCard: React.CSSProperties = { ...card, minHeight: 112 };
const metricGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 11, marginBottom: 14 };
const twoCol: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 14, marginBottom: 14 };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 0", borderTop: "1px solid #edf2f0", alignItems: "center" };
const operationRow: React.CSSProperties = { ...rowStyle, alignItems: "center", flexWrap: "wrap" };
const leadCard: React.CSSProperties = { ...card, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 14, alignItems: "center" };
const actionGroup: React.CSSProperties = { display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" };
const muted: React.CSSProperties = { color: "#61736f" };
const miniMuted: React.CSSProperties = { color: "#71827e", fontSize: 12.5, lineHeight: 1.45 };
const eyebrow: React.CSSProperties = { color: "#5f746e", fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" };
const backLink: React.CSSProperties = { color: "#087d78", textDecoration: "none", fontWeight: 750, fontSize: 13 };
const buttonBase: React.CSSProperties = { borderRadius: 11, padding: "10px 13px", fontWeight: 750, cursor: "pointer", minHeight: 40 };
const primaryButton: React.CSSProperties = { ...buttonBase, border: "1px solid #087d78", background: "#087d78", color: "white" };
const secondaryButton: React.CSSProperties = { ...buttonBase, border: "1px solid #c8d7d3", background: "white", color: "#12313b" };
const smallButton: React.CSSProperties = { ...secondaryButton, minHeight: 34, padding: "7px 10px", fontSize: 12.5 };
const primarySmallButton: React.CSSProperties = { ...primaryButton, minHeight: 34, padding: "7px 10px", fontSize: 12.5 };
const linkButton: React.CSSProperties = { ...secondaryButton, display: "inline-flex", alignItems: "center", textDecoration: "none" };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: 42, padding: "9px 11px", border: "1px solid #cbd9d5", borderRadius: 11, boxSizing: "border-box", background: "white", color: "#12313b", fontSize: 14 };
const selectStyle: React.CSSProperties = { ...inputStyle, width: "auto", minWidth: 135 };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 110, resize: "vertical" };
const toolbar: React.CSSProperties = { ...card, padding: 12, marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const tabBar: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8, marginBottom: 16 };
const tabButton: React.CSSProperties = { border: "1px solid #d4e1dd", background: "rgba(255,255,255,.8)", color: "#29454d", borderRadius: 13, padding: "10px 12px", textAlign: "left", cursor: "pointer" };
const activeTab: React.CSSProperties = { background: "#123f4d", borderColor: "#123f4d", color: "white", boxShadow: "0 8px 20px rgba(18,63,77,.14)" };
const livePill: React.CSSProperties = { borderRadius: 999, background: "#e7f7f1", color: "#13765d", padding: "4px 8px", fontSize: 10.5, fontWeight: 900, letterSpacing: ".05em" };
const countPill: React.CSSProperties = { borderRadius: 999, background: "#edf3f1", padding: "7px 10px", fontSize: 12, fontWeight: 750, color: "#536a64" };
const scorePill: React.CSSProperties = { borderRadius: 999, background: "#e8f4f2", padding: "5px 8px", color: "#087d78", fontWeight: 800, fontSize: 12 };
const statusPill: React.CSSProperties = { borderRadius: 999, background: "#edf2f5", padding: "5px 8px", color: "#50636b", fontWeight: 800, fontSize: 11 };
const donePill: React.CSSProperties = { ...statusPill, background: "#e7f7ee", color: "#20724b" };
const warningPill: React.CSSProperties = { ...statusPill, background: "#fff5dc", color: "#8a6419" };
const dangerPill: React.CSSProperties = { ...statusPill, background: "#feeaea", color: "#a13c3c" };
const bandPill = (value: string): React.CSSProperties => value === "HOT" ? dangerPill : value === "WARM" ? warningPill : statusPill;
const messagePreview: React.CSSProperties = { marginTop: 8, padding: "8px 10px", background: "#f5f8f7", borderRadius: 10, color: "#526762", fontSize: 12.5, lineHeight: 1.45, overflowWrap: "anywhere" };
const errorBox: React.CSSProperties = { position: "relative", background: "#fff0f0", color: "#9d2c2c", padding: "12px 42px 12px 13px", border: "1px solid #f0cccc", borderRadius: 12, marginBottom: 12 };
const successBox: React.CSSProperties = { background: "#eaf8f1", color: "#226849", padding: 12, border: "1px solid #c9ead9", borderRadius: 12, marginBottom: 12 };
const dismissButton: React.CSSProperties = { position: "absolute", right: 8, top: 5, border: 0, background: "transparent", color: "inherit", fontSize: 22, cursor: "pointer" };
const answerBox: React.CSSProperties = { background: "#eef7f5", border: "1px solid #d5e9e4", padding: 14, borderRadius: 12, lineHeight: 1.6, marginTop: 14, whiteSpace: "pre-wrap" };
const chipButton: React.CSSProperties = { border: "1px solid #d5e2de", background: "#f8fbfa", color: "#47605a", borderRadius: 999, padding: "6px 9px", fontSize: 11.5, cursor: "pointer" };
const attentionButton: React.CSSProperties = { ...rowStyle, width: "100%", background: "transparent", color: "#12313b", borderLeft: 0, borderRight: 0, borderBottom: 0, cursor: "pointer", textAlign: "left", font: "inherit" };
const modalBackdrop: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(10,31,39,.46)", display: "grid", placeItems: "center", padding: 14, overflowY: "auto" };
const modalCard: React.CSSProperties = { ...card, width: "min(100%,580px)", boxShadow: "0 30px 80px rgba(8,29,37,.28)" };
const closeButton: React.CSSProperties = { width: 38, height: 38, borderRadius: 999, border: "1px solid #d6e1de", background: "white", color: "#50645f", fontSize: 22, cursor: "pointer" };
