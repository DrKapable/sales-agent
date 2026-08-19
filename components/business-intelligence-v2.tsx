"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { teamDirectory } from "@/lib/team-directory";
import styles from "./business-intelligence-v2.module.css";

type Snapshot = any;
type View = "overview" | "leads" | "operations" | "intelligence";
type OpsView = "tasks" | "payments" | "quotes";
type FormKind = "task" | "quote" | "payment" | null;

const reviewsUrl = "https://maps.app.goo.gl/4kL9cCutoRFFs3aD8";
const collectReviewUrl = "https://share.google/QdIE9kViJz0Igntzb";

const tabs: Array<{ key: View; label: string; short: string; hint: string; icon: string }> = [
  { key: "overview", label: "Command centre", short: "Overview", hint: "KPIs and priorities", icon: "⌂" },
  { key: "leads", label: "Leads", short: "Leads", hint: "Score and convert", icon: "◎" },
  { key: "operations", label: "Operations", short: "Operations", hint: "Tasks, payments, quotes", icon: "▦" },
  { key: "intelligence", label: "Ask Intelligence", short: "Ask", hint: "Query business data", icon: "✦" }
];

function fmtDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : value;
}

function clientLabel(row: any) {
  return row.leadName || row.leadPhone || row.source_client || "No client linked";
}

function bandClass(value?: string) {
  if (value === "HOT") return styles.badgeHot;
  if (value === "WARM") return styles.badgeWarm;
  return styles.badgeNeutral;
}

function statusClass(value?: string) {
  if (value === "CONVERTED" || value === "VERIFIED" || value === "COMPLETED") return styles.badgeGood;
  if (value === "PAYMENT PENDING" || value === "PENDING") return styles.badgeWarm;
  return styles.badgeNeutral;
}

function priorityClass(value?: string) {
  const clean = String(value || "standard").toLowerCase();
  if (clean === "urgent") return styles.badgeHot;
  if (clean === "high") return styles.badgeWarm;
  if (clean === "low") return styles.badgeGood;
  return styles.badgeNeutral;
}

export function BusinessIntelligenceV2() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [opsView, setOpsView] = useState<OpsView>("tasks");
  const [search, setSearch] = useState("");
  const [band, setBand] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [formKind, setFormKind] = useState<FormKind>(null);
  const [formLead, setFormLead] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  async function refresh(showNotice = false) {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/business", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to load business intelligence.");
      setData(json);
      if (showNotice) setNotice("Business data refreshed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load business intelligence.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(id);
  }, [notice]);

  function navigate(nextView: View, setup?: () => void) {
    setup?.();
    setView(nextView);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function resetLeadFilters() {
    setSearch("");
    setBand("ALL");
    setStatus("ALL");
  }

  async function action(payload: any, success?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Action failed.");
      await refresh();
      if (success) setNotice(success);
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    if (!question.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/business/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to answer.");
      setAnswer(json.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to answer.");
    } finally {
      setBusy(false);
    }
  }

  function openForm(kind: Exclude<FormKind, null>, lead?: any) {
    setFormKind(kind);
    setFormLead(lead || null);
    setError("");
    if (kind === "task") setForm({ title: lead ? `Follow up ${lead.name || lead.phone}` : "", assignedTo: "", dueAt: "", notes: "", priority: "standard" });
    if (kind === "quote") setForm({ service: lead?.serviceInterest || lead?.packageName || "", amountZmw: "", details: "" });
    if (kind === "payment") setForm({ amountZmw: "", reference: "", verified: false });
  }

  async function submitForm() {
    if (!formKind) return;
    if (formKind === "task") {
      if (!form.title?.trim()) return setError("Enter a task title.");
      const dueAt = form.dueAt ? new Date(form.dueAt).toISOString() : undefined;
      const result = await action({
        action: "task",
        leadId: formLead?.id,
        title: form.title.trim(),
        assignedTo: form.assignedTo || undefined,
        dueAt,
        notes: form.notes || undefined,
        priority: form.priority || "standard"
      }, "Task created in Business Intelligence and the Research Portal.");
      if (result) setFormKind(null);
      return;
    }

    if (formKind === "quote") {
      if (!formLead?.id || !form.service?.trim() || !form.details?.trim()) return setError("Service and quotation details are required.");
      const result = await action({
        action: "quote",
        leadId: formLead.id,
        service: form.service.trim(),
        amountZmw: form.amountZmw === "" ? undefined : Number(form.amountZmw),
        details: form.details.trim()
      }, "Quotation saved and routed for sales visibility.");
      if (result) {
        const text = `MedMinds quotation\nClient: ${formLead.name || formLead.phone}\nService: ${form.service}\nAmount: ${form.amountZmw === "" ? "Tailored quotation" : `K${Number(form.amountZmw).toLocaleString()}`}\nDetails: ${form.details}`;
        await navigator.clipboard?.writeText(text).catch(() => undefined);
        setNotice("Quotation saved. A ready-to-send copy is on your clipboard.");
        setFormKind(null);
      }
      return;
    }

    if (!formLead?.id || !Number(form.amountZmw)) return setError("Enter a valid payment amount.");
    const result = await action({
      action: "payment",
      leadId: formLead.id,
      amountZmw: Number(form.amountZmw),
      reference: form.reference || undefined,
      verified: Boolean(form.verified),
      verifiedBy: "Admin"
    }, form.verified ? "Payment recorded as verified." : "Payment recorded and queued for verification.");
    if (result) setFormKind(null);
  }

  const filteredLeads = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.leads || []).filter((lead: any) => {
      const matchesText = !needle || [lead.name, lead.phone, lead.email, lead.serviceInterest, lead.packageName, lead.institution, lead.programme]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      return matchesText && (band === "ALL" || lead.scoreBand === band) && (status === "ALL" || lead.status === status);
    });
  }, [data, search, band, status]);

  const statuses = useMemo(() => Array.from(new Set((data?.leads || []).map((lead: any) => String(lead.status)))).sort(), [data]);
  const activeFilterCount = Number(Boolean(search.trim())) + Number(band !== "ALL") + Number(status !== "ALL");

  if (!data) {
    return <main className={styles.shell}>
      <div className={styles.loadingCard}>
        <Link href="/admin" className={styles.backLink}>← Agent Admin</Link>
        <div className={styles.loadingMark}>✦</div>
        <h1>Business Intelligence</h1>
        <p>{error || "Loading MedMinds business data…"}</p>
        {error && <button className={styles.secondaryButton} onClick={() => void refresh()}>Try again</button>}
      </div>
    </main>;
  }

  const metrics = [
    { label: "Total leads", value: data.metrics.totalLeads, hint: "All captured enquiries", icon: "◎", action: () => navigate("leads", resetLeadFilters) },
    { label: "Conversion", value: `${data.metrics.conversionRate}%`, hint: `${data.metrics.converted} converted`, icon: "↗", action: () => navigate("leads", () => { setBand("ALL"); setSearch(""); setStatus("CONVERTED"); }) },
    { label: "Hot leads", value: data.metrics.hotLeads, hint: "Priority sales action", icon: "⚡", action: () => navigate("leads", () => { setBand("HOT"); setStatus("ALL"); setSearch(""); }) },
    { label: "Follow-ups", value: data.metrics.followUpsDue, hint: "Due now", icon: "↻", action: () => navigate("leads", () => { setBand("ALL"); setSearch(""); setStatus("FOLLOW-UP REQUIRED"); }) },
    { label: "Pending payments", value: data.metrics.paymentPending, hint: "Awaiting verification", icon: "K", action: () => navigate("operations", () => setOpsView("payments")) },
    { label: "Open tasks", value: data.metrics.openTasks ?? 0, hint: `${data.metrics.overdueTasks ?? 0} overdue`, icon: "✓", action: () => navigate("operations", () => setOpsView("tasks")) }
  ];

  const quickQuestions = [
    "Which leads need attention?",
    "Why are leads being lost?",
    "Which services perform best?",
    "What payments are pending?"
  ];

  return <main className={styles.shell}>
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <Link href="/admin" className={styles.backLink}>← Agent Admin</Link>
          <div className={styles.titleRow}>
            <h1>Business Intelligence</h1>
            <span className={styles.livePill}>● LIVE</span>
          </div>
          <p>Monitor demand, prioritise opportunities and act on sales and operations from one workspace.</p>
          <span className={styles.updated}>Updated {fmtDate(data.generatedAt)}</span>
        </div>
        <button disabled={refreshing} onClick={() => void refresh(true)} className={styles.refreshButton}>
          <span className={refreshing ? styles.spin : ""}>↻</span> {refreshing ? "Refreshing…" : "Refresh data"}
        </button>
      </header>

      {error && <div className={styles.errorBox} role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {notice && <div className={styles.successBox} role="status">✓ {notice}</div>}

      <nav className={styles.tabBar} aria-label="Business Intelligence sections">
        {tabs.map((item) => <button
          key={item.key}
          className={`${styles.tabButton} ${view === item.key ? styles.tabActive : ""}`}
          onClick={() => navigate(item.key)}
          aria-current={view === item.key ? "page" : undefined}
        >
          <span className={styles.tabIcon}>{item.icon}</span>
          <span className={styles.tabText}><strong><span className={styles.desktopLabel}>{item.label}</span><span className={styles.mobileLabel}>{item.short}</span></strong><small>{item.hint}</small></span>
        </button>)}
      </nav>

      {view === "overview" && <>
        <section className={styles.metricRail} aria-label="Business KPIs">
          {metrics.map((metric) => <button key={metric.label} className={styles.metricCard} onClick={metric.action}>
            <span className={styles.metricTop}><span className={styles.metricIcon}>{metric.icon}</span><span className={styles.metricArrow}>↗</span></span>
            <span className={styles.metricLabel}>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.hint}</small>
          </button>)}
        </section>

        <section className={styles.dashboardGrid}>
          <article className={styles.card}>
            <SectionTitle eyebrow="Now" title="Action queue" subtitle="Tap an item to move directly to the work that needs attention." />
            <ActionRow label="Hot unconverted leads" value={data.metrics.hotLeads} tone="high" onClick={() => navigate("leads", () => { setBand("HOT"); setStatus("ALL"); setSearch(""); })} />
            <ActionRow label="Follow-ups due" value={data.metrics.followUpsDue} tone={data.metrics.followUpsDue ? "high" : "good"} onClick={() => navigate("leads", () => { setStatus("FOLLOW-UP REQUIRED"); setBand("ALL"); setSearch(""); })} />
            <ActionRow label="Overdue operations tasks" value={data.metrics.overdueTasks ?? 0} tone={data.metrics.overdueTasks ? "high" : "good"} onClick={() => navigate("operations", () => setOpsView("tasks"))} />
            <ActionRow label="Pending payment records" value={data.metrics.paymentPending} tone={data.metrics.paymentPending ? "medium" : "good"} onClick={() => navigate("operations", () => setOpsView("payments"))} />
            <ActionRow label="Warm leads inactive ≥3 days" value={data.metrics.staleWarmLeads ?? 0} tone={data.metrics.staleWarmLeads ? "medium" : "good"} onClick={() => navigate("leads", () => { setBand("WARM"); setStatus("ALL"); setSearch(""); })} />
          </article>

          <article className={styles.card}>
            <SectionTitle eyebrow="Demand" title="Services generating enquiries" subtitle="Lead volume with observed conversion performance." />
            {data.services.length ? data.services.slice(0, 8).map((row: any) => {
              const width = Math.max(4, Math.min(100, Number(row.conversionRate) || 0));
              return <div key={row.service} className={styles.serviceRow}>
                <div className={styles.serviceMeta}><strong>{row.service}</strong><span>{row.leads} lead{row.leads === 1 ? "" : "s"}</span></div>
                <div className={styles.serviceScore}><span>{row.conversionRate}%</span><div className={styles.progressTrack}><div className={styles.progressBar} style={{ width: `${width}%` }} /></div></div>
              </div>;
            }) : <Empty text="No service data yet." />}
          </article>
        </section>

        <section className={styles.dashboardGrid}>
          <article className={styles.card}>
            <SectionTitle eyebrow="Conversion" title="Why leads are being lost" subtitle="Signals derived from real sales conversations." />
            {data.lostReasons.length ? data.lostReasons.slice(0, 8).map((row: any, index: number) => <div key={row.reason} className={styles.reasonRow}>
              <span className={styles.reasonRank}>{index + 1}</span><span className={styles.reasonText}>{row.reason}</span><strong>{row.count}</strong>
            </div>) : <Empty text="No lost-lead pattern has been established yet." />}
          </article>

          <article className={styles.card}>
            <SectionTitle eyebrow="System" title="Workflow health" subtitle="Operational readiness across the Intelligence workflows." />
            <Feature name="Lead scoring & prioritisation" detail={`${data.metrics.hotLeads} hot leads identified`} />
            <Feature name="Follow-up monitoring" detail={`${data.metrics.followUpsDue} currently due`} />
            <Feature name="Task workflow" detail={`${data.metrics.openTasks ?? 0} open · completion enabled`} />
            <Feature name="Payment workflow" detail={`${data.metrics.paymentPending} pending · verification enabled`} />
            <Feature name="Quotation workflow" detail={`${data.metrics.quotesCreated ?? data.quotes.length} stored`} />
            <Feature name="WhatsApp event routing" detail="Business events route by staff role" />
          </article>
        </section>

        <article className={`${styles.card} ${styles.reputationCard}`}>
          <div><SectionTitle eyebrow="Trust" title="Reputation tools" subtitle="Use public proof when credibility is relevant and request reviews after satisfactory service." /></div>
          <div className={styles.linkActions}><a href={reviewsUrl} target="_blank" rel="noreferrer" className={styles.secondaryButton}>View public reviews ↗</a><a href={collectReviewUrl} target="_blank" rel="noreferrer" className={styles.primaryButton}>Open review form ↗</a></div>
        </article>
      </>}

      {view === "leads" && <>
        <section className={styles.leadSummary} aria-label="Lead score filters">
          {["ALL", "HOT", "WARM", "COLD"].map((item) => {
            const count = item === "ALL" ? data.leads.length : data.leads.filter((lead: any) => lead.scoreBand === item).length;
            return <button key={item} className={`${styles.summaryChip} ${band === item ? styles.summaryChipActive : ""}`} onClick={() => setBand(item)}><span>{item === "ALL" ? "All leads" : item}</span><strong>{count}</strong></button>;
          })}
        </section>

        <section className={styles.filterBar}>
          <label className={styles.searchField}><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, institution or service…" /></label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.select}><option value="ALL">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <span className={styles.resultCount}>{filteredLeads.length} shown</span>
          {activeFilterCount > 0 && <button className={styles.clearButton} onClick={resetLeadFilters}>Clear filters ({activeFilterCount})</button>}
        </section>

        <section className={styles.leadList}>
          {filteredLeads.length ? filteredLeads.map((lead: any) => {
            const expanded = expandedLeadId === lead.id;
            return <article key={lead.id} className={styles.leadCard}>
              <div className={styles.leadMain}>
                <div className={styles.leadHeading}>
                  <div className={styles.avatar}>{String(lead.name || lead.phone || "?").trim().charAt(0).toUpperCase()}</div>
                  <div className={styles.leadIdentity}><div className={styles.leadNameRow}><strong>{lead.name || "Unnamed client"}</strong><span className={`${styles.badge} ${bandClass(lead.scoreBand)}`}>{lead.scoreBand} {lead.leadScore}/100</span><span className={`${styles.badge} ${statusClass(lead.status)}`}>{lead.status}</span></div><span>{lead.phone}</span></div>
                </div>
                <div className={styles.leadSummaryText}><strong>{lead.serviceInterest || lead.packageName || "Service not established"}</strong><span>Last active {lead.inactiveDays ?? 0} day{lead.inactiveDays === 1 ? "" : "s"} ago</span></div>

                {expanded && <div className={styles.leadDetails}>
                  <Detail label="Institution" value={lead.institution || "Not provided"} />
                  <Detail label="Programme" value={lead.programme || "Not provided"} />
                  <Detail label="Email" value={lead.email || "Not provided"} />
                  <Detail label="Score" value={`${lead.leadScore}/100 · ${lead.scoreBand}`} />
                  {lead.lastMessage && <div className={styles.messagePreview}><span>Latest client message</span><p>“{lead.lastMessage}”</p></div>}
                  {lead.lostReason && <div className={styles.lostSignal}>Lost signal: {lead.lostReason}</div>}
                </div>}
                <button className={styles.detailsToggle} onClick={() => setExpandedLeadId(expanded ? null : lead.id)}>{expanded ? "Hide details ↑" : "View details ↓"}</button>
              </div>

              <div className={styles.leadActions}>
                <button onClick={() => openForm("task", lead)}>+ Task</button>
                <button onClick={() => openForm("quote", lead)}>Quote</button>
                <button className={styles.primaryAction} onClick={() => openForm("payment", lead)}>Payment</button>
                {lead.status === "CONVERTED" && <button disabled={busy} onClick={() => void action({ action: "review_request", leadId: lead.id }, "Review request sent.")}>Review</button>}
              </div>
            </article>;
          }) : <article className={styles.card}><Empty text="No leads match these filters." /></article>}
        </section>
      </>}

      {view === "operations" && <>
        <div className={styles.opsHeader}>
          <div><h2>Operations</h2><p>Switch between tasks, payments and quotations without leaving the workspace.</p></div>
          <button className={styles.primaryButton} onClick={() => openForm("task")}>+ New task</button>
        </div>

        <div className={styles.opsTabs} role="tablist" aria-label="Operations views">
          <button className={opsView === "tasks" ? styles.opsTabActive : ""} onClick={() => setOpsView("tasks")}><span>Tasks</span><strong>{data.tasks.length}</strong></button>
          <button className={opsView === "payments" ? styles.opsTabActive : ""} onClick={() => setOpsView("payments")}><span>Payments</span><strong>{data.payments.length}</strong></button>
          <button className={opsView === "quotes" ? styles.opsTabActive : ""} onClick={() => setOpsView("quotes")}><span>Quotations</span><strong>{data.quotes.length}</strong></button>
        </div>

        <article className={styles.card}>
          {opsView === "tasks" && <>
            <SectionTitle eyebrow="Delivery" title="Tasks" subtitle="Synchronized with the Research Portal where applicable." />
            <div className={styles.operationList}>{data.tasks.length ? data.tasks.slice(0, 50).map((task: any) => <div key={task.id} className={styles.operationCard}>
              <div className={styles.operationBody}><div className={styles.operationTitle}><strong>{task.title}</strong><span className={`${styles.badge} ${priorityClass(task.priority)}`}>{String(task.priority || "standard").toUpperCase()}</span>{task.source === "research-portal" && <span className={`${styles.badge} ${styles.badgeInfo}`}>Research Portal</span>}</div><span>{clientLabel(task)} · {task.assigned_to || "Unassigned"}</span>{(task.program || task.academic_level) && <span>{[task.program, task.academic_level].filter(Boolean).join(" · ")}</span>}<span>{task.due_at ? `Due ${fmtDate(task.due_at)}` : "No deadline"}</span>{task.notes && <p>{task.notes}</p>}</div>
              <div className={styles.operationActions}><span className={`${styles.badge} ${statusClass(task.status)}`}>{task.status}</span>{task.status !== "COMPLETED" && <button disabled={busy} onClick={() => void action({ action: "task_status", taskId: task.id, status: "COMPLETED" }, "Task marked complete.")}>Complete</button>}</div>
            </div>) : <Empty text="No internal tasks yet." />}</div>
          </>}

          {opsView === "payments" && <>
            <SectionTitle eyebrow="Finance" title="Payments" subtitle="Verification status and receipt references." />
            <div className={styles.operationList}>{data.payments.length ? data.payments.slice(0, 50).map((payment: any) => <div key={payment.id} className={styles.operationCard}>
              <div className={styles.operationBody}><div className={styles.operationTitle}><strong>K{Number(payment.amount_zmw).toLocaleString()}</strong></div><span>{clientLabel(payment)}</span><span>{payment.reference || "No reference"} · MM-{String(payment.id).slice(0, 8).toUpperCase()}</span></div>
              <div className={styles.operationActions}><span className={`${styles.badge} ${statusClass(payment.status)}`}>{payment.status}</span>{payment.status === "PENDING" && <button className={styles.primaryAction} disabled={busy} onClick={() => void action({ action: "verify_payment", paymentId: payment.id, verifiedBy: "Admin" }, "Payment verified and the team was notified.")}>Verify</button>}</div>
            </div>) : <Empty text="No payment records yet." />}</div>
          </>}

          {opsView === "quotes" && <>
            <SectionTitle eyebrow="Sales" title="Quotations" subtitle="Saved quotations remain linked to the originating lead." />
            <div className={styles.operationList}>{data.quotes.length ? data.quotes.slice(0, 50).map((quote: any) => <div key={quote.id} className={styles.operationCard}>
              <div className={styles.operationBody}><div className={styles.operationTitle}><strong>{quote.service}</strong></div><span>{clientLabel(quote)}</span><p>{quote.details}</p></div><strong className={styles.quoteAmount}>{quote.amount_zmw == null ? "Tailored" : `K${Number(quote.amount_zmw).toLocaleString()}`}</strong>
            </div>) : <Empty text="No quotations yet." />}</div>
          </>}
        </article>
      </>}

      {view === "intelligence" && <section className={styles.intelligenceGrid}>
        <article className={styles.card}>
          <SectionTitle eyebrow="Ask" title="Ask MedMinds business data" subtitle="Answers use the current business dataset rather than generic advice." />
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about conversion, lead priorities, services, payments or operations…" className={styles.textarea} />
          <div className={styles.questionChips}>{quickQuestions.map((q) => <button key={q} onClick={() => setQuestion(q)}>{q}</button>)}</div>
          <div className={styles.askActions}><button disabled={busy || !question.trim()} onClick={() => void ask()} className={styles.primaryButton}>{busy ? "Analysing…" : "Ask Intelligence ✦"}</button>{answer && <button className={styles.secondaryButton} onClick={() => { setAnswer(""); setQuestion(""); }}>Clear</button>}</div>
          {answer && <div className={styles.answerBox}><span>Intelligence response</span><div>{answer}</div></div>}
        </article>

        <aside className={`${styles.card} ${styles.focusCard}`}>
          <SectionTitle eyebrow="Today" title="Management focus" subtitle={`Snapshot updated ${fmtDate(data.generatedAt)}`} />
          <Focus value={data.metrics.hotLeads} label="hot unconverted leads" onClick={() => navigate("leads", () => { setBand("HOT"); setStatus("ALL"); })} />
          <Focus value={data.metrics.followUpsDue} label="follow-ups due" onClick={() => navigate("leads", () => { setBand("ALL"); setStatus("FOLLOW-UP REQUIRED"); })} />
          <Focus value={data.metrics.paymentPending} label="pending payment records" onClick={() => navigate("operations", () => setOpsView("payments"))} />
          <Focus value={data.metrics.overdueTasks ?? 0} label="overdue operations tasks" onClick={() => navigate("operations", () => setOpsView("tasks"))} />
          <p className={styles.focusNote}>Tap a focus item to open the relevant workflow. Important events are also routed to the appropriate team members through WhatsApp.</p>
        </aside>
      </section>}
    </div>

    {formKind && <div className={styles.modalBackdrop} onMouseDown={(e) => { if (e.currentTarget === e.target && !busy) setFormKind(null); }}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-label={formKind === "task" ? "Create task" : formKind === "quote" ? "Create quotation" : "Record payment"}>
        <div className={styles.sheetHandle} />
        <div className={styles.modalHeader}><div><span>{formKind === "task" ? "Operations" : formKind === "quote" ? "Sales" : "Finance"}</span><h2>{formKind === "task" ? "Create task" : formKind === "quote" ? "Create quotation" : "Record payment"}</h2>{formLead && <p>{formLead.name || formLead.phone} · {formLead.phone}</p>}</div><button disabled={busy} onClick={() => setFormKind(null)} aria-label="Close">×</button></div>
        <div className={styles.formGrid}>
          {formKind === "task" && <>
            <Field label="Task title"><input className={styles.input} value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <div className={styles.formColumns}><Field label="Priority"><select className={styles.input} value={form.priority || "standard"} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="standard">Standard</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field><Field label="Due date/time"><input type="datetime-local" className={styles.input} value={form.dueAt || ""} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></Field></div>
            <Field label="Assign to"><select className={styles.input} value={form.assignedTo || ""} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}><option value="">Leave unassigned</option>{teamDirectory.map((person) => <option key={person.name} value={person.name}>{person.name}</option>)}</select></Field>
            <Field label="Notes / instructions"><textarea className={styles.textarea} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </>}
          {formKind === "quote" && <>
            <Field label="Service"><input className={styles.input} value={form.service || ""} onChange={(e) => setForm({ ...form, service: e.target.value })} /></Field>
            <Field label="Amount (ZMW)"><input type="number" min="0" className={styles.input} placeholder="Leave blank for tailored quotation" value={form.amountZmw ?? ""} onChange={(e) => setForm({ ...form, amountZmw: e.target.value })} /></Field>
            <Field label="Quotation details"><textarea className={styles.textarea} value={form.details || ""} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field>
          </>}
          {formKind === "payment" && <>
            <Field label="Amount received (ZMW)"><input type="number" min="0" step="0.01" className={styles.input} value={form.amountZmw ?? ""} onChange={(e) => setForm({ ...form, amountZmw: e.target.value })} /></Field>
            <Field label="Reference / note"><input className={styles.input} value={form.reference || ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
            <label className={styles.checkbox}><input type="checkbox" checked={Boolean(form.verified)} onChange={(e) => setForm({ ...form, verified: e.target.checked })} /><span>Payment has already been independently verified</span></label>
          </>}
        </div>
        <div className={styles.modalActions}><button disabled={busy} className={styles.secondaryButton} onClick={() => setFormKind(null)}>Cancel</button><button disabled={busy} className={styles.primaryButton} onClick={() => void submitForm()}>{busy ? "Saving…" : "Save"}</button></div>
      </div>
    </div>}
  </main>;
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className={styles.sectionTitle}><span>{eyebrow}</span><h3>{title}</h3><p>{subtitle}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className={styles.empty}>{text}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className={styles.detail}><span>{label}</span><strong>{value}</strong></div>;
}

function Feature({ name, detail }: { name: string; detail: string }) {
  return <div className={styles.feature}><span className={styles.readyDot}>✓</span><div><strong>{name}</strong><span>{detail}</span></div><span className={`${styles.badge} ${styles.badgeGood}`}>Ready</span></div>;
}

function ActionRow({ label, value, tone, onClick }: { label: string; value: number; tone: "high" | "medium" | "good"; onClick: () => void }) {
  const toneClass = tone === "high" ? styles.badgeHot : tone === "medium" ? styles.badgeWarm : styles.badgeGood;
  return <button className={styles.actionRow} onClick={onClick}><span>{label}</span><span className={`${styles.badge} ${toneClass}`}>{value}</span><span className={styles.chevron}>›</span></button>;
}

function Focus({ value, label, onClick }: { value: number; label: string; onClick: () => void }) {
  return <button className={styles.focusRow} onClick={onClick}><strong>{value}</strong><span>{label}</span><span>›</span></button>;
}
