"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { humanFollowUpCss } from "@/components/human-follow-up-styles";
import { FOLLOW_UP_TEAM, type FollowUpTeamMember } from "@/lib/follow-up-team";

type Channel = "CALL" | "WHATSAPP" | "SMS";
type Outcome = "REACHED_CONTINUE" | "NO_ANSWER" | "INTERESTED" | "READY_TO_PROCEED" | "NOT_INTERESTED" | "OTHER";
type NextMode = "tomorrow" | "manual" | "drop";

type FollowUpTask = {
  id: string;
  phone: string;
  scheduledAt: string;
  status: "PENDING" | "COMPLETED" | "DROPPED";
  reason: string | null;
  source: "MARY" | "MANUAL";
  sequenceStep: number;
  notifiedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  channel: Channel | null;
  summary: string | null;
  outcome: Outcome | null;
  message: string | null;
  transportStatus: string | null;
  nextScheduledAt: string | null;
  dueState: "OVERDUE" | "DUE_TODAY" | "UPCOMING" | "DONE" | "DROPPED";
  lastClientMessage: string | null;
  lastAgentMessage: string | null;
  lastActivityAt: string | null;
  suggestedMessage: string;
  lead: {
    id: string;
    phone: string;
    name: string | null;
    serviceInterest: string | null;
    packageName: string | null;
    programme: string | null;
    deadline: string | null;
    status: string;
    priority: string;
    followUpAt: string | null;
    source: string;
    updatedAt: string;
  } | null;
};

type AvailableLead = {
  id: string;
  phone: string;
  name: string | null;
  serviceInterest: string | null;
  packageName: string | null;
  status: string;
  priority: string;
};

type Payload = { tasks: FollowUpTask[]; availableLeads: AvailableLead[]; smsConfigured: boolean };
type Filter = "DUE" | "UPCOMING" | "COMPLETED" | "DROPPED" | "ALL";

function displayDate(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not scheduled";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function toLocalInput(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function initials(name?: string | null) {
  return name?.trim() ? name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() : "?";
}

function outcomeLabel(value?: Outcome | null) {
  const labels: Record<Outcome, string> = {
    REACHED_CONTINUE: "Reached · continue follow-up",
    NO_ANSWER: "No answer",
    INTERESTED: "Interested",
    READY_TO_PROCEED: "Ready to proceed",
    NOT_INTERESTED: "Not interested",
    OTHER: "Other"
  };
  return value ? labels[value] : "";
}

function dueLabel(task: FollowUpTask) {
  if (task.dueState === "OVERDUE") return `Due now · ${displayDate(task.scheduledAt)}`;
  if (task.dueState === "DUE_TODAY") return `Due today · ${displayDate(task.scheduledAt)}`;
  if (task.dueState === "UPCOMING") return `Upcoming · ${displayDate(task.scheduledAt)}`;
  if (task.dueState === "DONE") return `Completed · ${displayDate(task.completedAt)}`;
  return `Dropped · ${displayDate(task.completedAt)}`;
}

function whatsappUrl(task: FollowUpTask) {
  const phone = task.phone.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(task.suggestedMessage)}`;
}

export function HumanFollowUpPanel({ onBack }: { onBack?: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("DUE");
  const [query, setQuery] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualAt, setManualAt] = useState(() => toLocalInput());
  const [manualReason, setManualReason] = useState("");
  const [manualBy, setManualBy] = useState<FollowUpTeamMember>(FOLLOW_UP_TEAM[0]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/admin/follow-ups", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to load follow-ups.");
      setData(json as Payload);
      setError("");
    } catch (err) {
      if (!quiet) setError(err instanceof Error ? err.message : "Unable to load follow-ups.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => {
    const tasks = data?.tasks || [];
    return {
      due: tasks.filter((task) => task.status === "PENDING" && ["OVERDUE", "DUE_TODAY"].includes(task.dueState)).length,
      upcoming: tasks.filter((task) => task.status === "PENDING" && task.dueState === "UPCOMING").length,
      completed: tasks.filter((task) => task.status === "COMPLETED").length,
      dropped: tasks.filter((task) => task.status === "DROPPED").length
    };
  }, [data]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (data?.tasks || []).filter((task) => {
      const matchFilter = filter === "ALL"
        || (filter === "DUE" && task.status === "PENDING" && ["OVERDUE", "DUE_TODAY"].includes(task.dueState))
        || (filter === "UPCOMING" && task.status === "PENDING" && task.dueState === "UPCOMING")
        || (filter === "COMPLETED" && task.status === "COMPLETED")
        || (filter === "DROPPED" && task.status === "DROPPED");
      if (!matchFilter) return false;
      const lead = task.lead;
      const haystack = `${lead?.name || ""} ${task.phone} ${lead?.serviceInterest || lead?.packageName || ""} ${task.reason || ""}`.toLowerCase();
      return !search || haystack.includes(search);
    });
  }, [data, filter, query]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Unable to update follow-up.");
    return json;
  }

  async function scheduleManual() {
    if (!manualPhone || !manualAt) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await post({
        action: "schedule",
        phone: manualPhone,
        scheduledAt: new Date(manualAt).toISOString(),
        reason: manualReason.trim() || undefined,
        createdBy: manualBy
      });
      setNotice("Follow-up scheduled and added to the human queue.");
      setManualOpen(false);
      setManualPhone("");
      setManualReason("");
      setManualAt(toLocalInput());
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to schedule follow-up.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="hfuShell">
    <div className="hfuContainer">
      <header className="hfuHeader">
        <div>
          <button type="button" className="hfuBack" onClick={onBack}>← Business dashboard</button>
          <div className="hfuTitle"><h1>Human follow-ups</h1><span>FOLLOW-UP WORKSPACE</span></div>
          <p>Mary schedules the right clients. The follow-up team owns the contact, outcome and next follow-up.</p>
        </div>
        <div className="hfuHeaderActions">
          <button type="button" className="hfuGhost" onClick={() => void load()} disabled={loading}>↻ Refresh</button>
          <button type="button" className="hfuPrimary" onClick={() => setManualOpen((value) => !value)}>＋ Schedule follow-up</button>
        </div>
      </header>

      {error ? <div className="hfuAlert error">{error}</div> : null}
      {notice ? <div className="hfuAlert success">{notice}</div> : null}

      <section className="hfuMetrics" aria-label="Follow-up summary">
        <button className={filter === "DUE" ? "active" : ""} onClick={() => setFilter("DUE")}><span>Due now</span><strong>{counts.due}</strong><small>needs human action</small></button>
        <button className={filter === "UPCOMING" ? "active" : ""} onClick={() => setFilter("UPCOMING")}><span>Upcoming</span><strong>{counts.upcoming}</strong><small>already scheduled</small></button>
        <button className={filter === "COMPLETED" ? "active" : ""} onClick={() => setFilter("COMPLETED")}><span>Completed</span><strong>{counts.completed}</strong><small>logged outcomes</small></button>
        <button className={filter === "DROPPED" ? "active" : ""} onClick={() => setFilter("DROPPED")}><span>Dropped</span><strong>{counts.dropped}</strong><small>removed from queue</small></button>
      </section>

      {manualOpen ? <section className="hfuManual">
        <div><h2>Schedule a client manually</h2><p>Add any active client to the human queue or reschedule an existing follow-up.</p></div>
        <div className="hfuManualGrid">
          <label>Client<select value={manualPhone} onChange={(event) => setManualPhone(event.target.value)}><option value="">Select client</option>{(data?.availableLeads || []).map((lead) => <option key={lead.id} value={lead.phone}>{lead.name || lead.phone} · {lead.serviceInterest || lead.packageName || lead.status}</option>)}</select></label>
          <label>Date & time<input type="datetime-local" value={manualAt} min={toLocalInput(new Date().toISOString())} onChange={(event) => setManualAt(event.target.value)} /></label>
          <label>Scheduled by<select value={manualBy} onChange={(event) => setManualBy(event.target.value as FollowUpTeamMember)}>{FOLLOW_UP_TEAM.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label className="wide">Reason / context<input value={manualReason} onChange={(event) => setManualReason(event.target.value)} placeholder="Optional: e.g. call after quotation review" /></label>
        </div>
        <div className="hfuManualActions"><button type="button" className="hfuGhost" onClick={() => setManualOpen(false)}>Cancel</button><button type="button" className="hfuPrimary" disabled={busy || !manualPhone || !manualAt} onClick={() => void scheduleManual()}>{busy ? "Scheduling…" : "Schedule"}</button></div>
      </section> : null}

      <div className="hfuToolbar">
        <div className="hfuFilters" role="tablist" aria-label="Follow-up status">
          <button className={filter === "DUE" ? "active" : ""} onClick={() => setFilter("DUE")}>Due</button>
          <button className={filter === "UPCOMING" ? "active" : ""} onClick={() => setFilter("UPCOMING")}>Upcoming</button>
          <button className={filter === "COMPLETED" ? "active" : ""} onClick={() => setFilter("COMPLETED")}>Completed</button>
          <button className={filter === "DROPPED" ? "active" : ""} onClick={() => setFilter("DROPPED")}>Dropped</button>
          <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>All</button>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, number or service" />
      </div>

      {!data && loading ? <div className="hfuLoading">Loading human follow-ups…</div> : null}
      {data ? <section className="hfuList" aria-live="polite">
        {visible.map((task) => <FollowUpCard key={task.id} task={task} smsConfigured={data.smsConfigured} post={post} onChanged={async (message) => { setNotice(message); setError(""); await load(true); }} onError={(message) => { setError(message); setNotice(""); }} />)}
        {!visible.length ? <div className="hfuEmpty"><strong>{filter === "DUE" ? "No human follow-ups are due right now" : "No follow-ups match this view"}</strong><p>Mary will place eligible clients here as their follow-up time arrives, or you can schedule one manually.</p></div> : null}
      </section> : null}
    </div>
    <style dangerouslySetInnerHTML={{ __html: humanFollowUpCss }} />
  </main>;
}

function FollowUpCard({ task, smsConfigured, post, onChanged, onError }: {
  task: FollowUpTask;
  smsConfigured: boolean;
  post: (body: Record<string, unknown>) => Promise<any>;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const lead = task.lead;
  const [channel, setChannel] = useState<Channel>(task.channel || "WHATSAPP");
  const [outcome, setOutcome] = useState<Outcome>(task.outcome || "REACHED_CONTINUE");
  const [summary, setSummary] = useState(task.summary || "");
  const [nextMode, setNextMode] = useState<NextMode>("tomorrow");
  const [nextAt, setNextAt] = useState(() => toLocalInput());
  const [completedBy, setCompletedBy] = useState<FollowUpTeamMember>(FOLLOW_UP_TEAM[0]);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsMessage, setSmsMessage] = useState(task.message || task.suggestedMessage);
  const [busy, setBusy] = useState(false);
  const closed = task.status !== "PENDING";

  async function sendSms() {
    setBusy(true);
    try {
      await post({ action: "send_sms", taskId: task.id, message: smsMessage });
      setChannel("SMS");
      await onChanged("SMS submitted through Africa’s Talking. Log the outcome when the follow-up is complete.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to send SMS.");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!summary.trim()) {
      onError("Add a short follow-up summary before ticking it complete.");
      return;
    }
    setBusy(true);
    try {
      await post({
        action: "complete",
        taskId: task.id,
        completedBy,
        channel,
        summary,
        outcome,
        nextMode,
        nextAt: nextMode === "manual" ? new Date(nextAt).toISOString() : null
      });
      await onChanged(nextMode === "drop"
        ? "Client removed from the follow-up queue."
        : nextMode === "manual"
          ? "Follow-up completed and the next date was scheduled."
          : "Follow-up completed. The next follow-up is scheduled for tomorrow.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to complete follow-up.");
    } finally {
      setBusy(false);
    }
  }

  function changeOutcome(value: Outcome) {
    setOutcome(value);
    if (value === "NOT_INTERESTED") setNextMode("drop");
  }

  return <article className={`hfuCard ${task.dueState === "OVERDUE" ? "overdue" : ""} ${task.status === "COMPLETED" ? "done" : ""} ${task.status === "DROPPED" ? "dropped" : ""}`}>
    <div className="hfuCardTop">
      <div className="hfuIdentity"><span className="hfuAvatar">{initials(lead?.name)}</span><div className="hfuIdentityCopy"><strong>{lead?.name || task.phone}</strong><span>{lead?.serviceInterest || lead?.packageName || "Service not established"} · {task.phone}</span><span>{lead?.status || "Lead record unavailable"}{lead?.programme ? ` · ${lead.programme}` : ""}</span></div></div>
      <div className="hfuBadges"><span className={`hfuBadge ${task.dueState === "OVERDUE" ? "overdue" : task.dueState === "DUE_TODAY" ? "today" : "upcoming"}`}>{dueLabel(task)}</span>{lead?.priority ? <span className={`hfuBadge ${lead.priority.toLowerCase()}`}>{lead.priority}</span> : null}<span className="hfuBadge">Step {task.sequenceStep}</span></div>
    </div>

    <div className="hfuReason"><strong>{task.source === "MARY" ? "Mary scheduled" : "Human scheduled"}</strong><span>·</span><span>{task.reason || "Follow-up required"}</span></div>

    <div className="hfuContext"><div><label>Latest client message</label><p>{task.lastClientMessage || "No recent client text available."}</p></div><div><label>Suggested follow-up</label><p>{task.suggestedMessage}</p></div></div>

    {!closed ? <>
      <div className="hfuActions">
        <a className="hfuAction" href={`tel:+${task.phone.replace(/\D/g, "")}`} onClick={() => setChannel("CALL")}>☎ Call</a>
        <a className="hfuAction whatsapp" href={whatsappUrl(task)} target="_blank" rel="noreferrer" onClick={() => setChannel("WHATSAPP")}>◉ WhatsApp</a>
        <button type="button" className="hfuAction sms" disabled={!smsConfigured} title={smsConfigured ? "Send SMS through Africa’s Talking" : "Configure Africa’s Talking first"} onClick={() => { setSmsOpen((value) => !value); setChannel("SMS"); }}>✉ SMS</button>
      </div>
      {smsOpen ? <div className="hfuSmsBox"><textarea value={smsMessage} maxLength={1200} onChange={(event) => setSmsMessage(event.target.value)} aria-label="SMS follow-up message" /><div className="hfuSmsActions"><span>{smsMessage.length}/1200 · Africa’s Talking</span><button disabled={busy || !smsMessage.trim()} onClick={() => void sendSms()}>{busy ? "Sending…" : "Send SMS"}</button></div></div> : null}
      {!smsConfigured ? <div className="hfuReason"><span>SMS is ready in the workflow but Africa’s Talking credentials still need to be configured on the server.</span></div> : null}

      <details className="hfuLog"><summary><span>✓ Log and complete this follow-up</span></summary><div className="hfuForm">
        <label>Completed by<select value={completedBy} onChange={(event) => setCompletedBy(event.target.value as FollowUpTeamMember)}>{FOLLOW_UP_TEAM.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>Contact channel<select value={channel} onChange={(event) => setChannel(event.target.value as Channel)}><option value="CALL">Call</option><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option></select></label>
        <label>Outcome<select value={outcome} onChange={(event) => changeOutcome(event.target.value as Outcome)}><option value="REACHED_CONTINUE">Reached · continue follow-up</option><option value="NO_ANSWER">No answer</option><option value="INTERESTED">Interested</option><option value="READY_TO_PROCEED">Ready to proceed</option><option value="NOT_INTERESTED">Not interested</option><option value="OTHER">Other</option></select></label>
        <label>Next action<select value={nextMode} onChange={(event) => setNextMode(event.target.value as NextMode)}><option value="tomorrow">Auto schedule tomorrow</option><option value="manual">Choose date & time</option><option value="drop">Drop from follow-up</option></select></label>
        {nextMode === "manual" ? <label className="wide">Next follow-up<input type="datetime-local" min={toLocalInput(new Date().toISOString())} value={nextAt} onChange={(event) => setNextAt(event.target.value)} /></label> : null}
        <label className="wide">Follow-up summary<textarea value={summary} maxLength={1600} onChange={(event) => setSummary(event.target.value)} placeholder="What happened? What did the client say? What should the next person know?" /></label>
        {nextMode === "drop" ? <div className="wide hfuAlert error">Dropping removes this client from Mary’s automatic follow-up queue. If the outcome is “Not interested,” the lead will also be marked Lost Lead.</div> : null}
        <div className="hfuComplete"><button disabled={busy || summary.trim().length < 5} onClick={() => void complete()}>{busy ? "Saving…" : "✓ Follow-up completed"}</button></div>
      </div></details>
    </> : <div className="hfuHistory"><p><strong>{task.status === "DROPPED" ? "Dropped from follow-up" : outcomeLabel(task.outcome)}</strong>{task.channel ? ` · ${task.channel}` : ""}{task.completedBy ? ` · ${task.completedBy}` : ""}</p><p>{task.summary || "No summary recorded."}</p>{task.nextScheduledAt ? <small>Next follow-up: {displayDate(task.nextScheduledAt)}</small> : null}{task.transportStatus ? <small>SMS: {task.transportStatus}</small> : null}</div>}
  </article>;
}
