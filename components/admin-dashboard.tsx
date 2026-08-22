"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BrandLogo } from "@/components/brand-logo";
import type { getSetupState } from "@/lib/env";
import { leadPriorities, leadStatuses, type ConversationMessage, type Lead, type Offer } from "@/lib/types";

type Setup = ReturnType<typeof getSetupState>;
type ConversationState = { lead: Lead; messages: ConversationMessage[]; replyWindow: { open: boolean; expiresAt: string | null }; delivery?: { status: "accepted" | "simulated"; messageId: string | null } };
type Tab = "leads" | "offers" | "setup";
type LeadSort = "smart" | "recent" | "oldest" | "name" | "priority";
const staffMembers = ["Dr. Mustafa Juma Phiri", "Dr Kanyembo Ng'andwe"] as const;
const CONVERSATION_REFRESH_MS = 5000;
const INBOX_REFRESH_MS = 10000;
const quickReplies = [
  { label: "Acknowledge", text: "Thank you for contacting MedMinds. I am reviewing your request and will assist you shortly." },
  { label: "Research pricing", text: "You can review our research service prices here: https://www.medmindslc.online/pricing" },
  { label: "Payment details", text: "Payments are submitted to 0977259132, Juma Phiri. Please send your proof of payment here for confirmation." }
] as const;

export function AdminDashboard({ initialLeads, initialOffers, setup }: { initialLeads: Lead[]; initialOffers: Offer[]; setup: Setup }) {
  const [leads, setLeads] = useState(initialLeads);
  const [offers, setOffers] = useState(initialOffers);
  const [tab, setTab] = useState<Tab>("leads");
  const [selectedLeadId, setSelectedLeadId] = useState(initialLeads[0]?.id ?? null);
  const [conversation, setConversation] = useState<ConversationState | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState("");
  const [conversationNotice, setConversationNotice] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sender, setSender] = useState<(typeof staffMembers)[number]>(staffMembers[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [leadSort, setLeadSort] = useState<LeadSort>("smart");
  const [offerQuery, setOfferQuery] = useState("");
  const [offerCategory, setOfferCategory] = useState("All categories");
  const conversationRefreshInFlight = useRef(false);
  const inboxRefreshInFlight = useRef(false);

  const converted = leads.filter((lead) => lead.status === "CONVERTED").length;
  const humanManaged = leads.filter((lead) => lead.aiPaused).length;
  const followUps = leads.filter((lead) => lead.status === "FOLLOW-UP REQUIRED" || lead.status === "HUMAN ASSISTANCE REQUIRED").length;
  const dueFollowUps = leads.filter((lead) => isFollowUpDue(lead)).length;
  const conversion = leads.length ? Math.round((converted / leads.length) * 100) : 0;
  const counts = useMemo(() => leadStatuses.map((status) => ({ status, count: leads.filter((lead) => lead.status === status).length })), [leads]);
  const filteredLeads = useMemo(() => {
    const needle = leadQuery.trim().toLowerCase();
    const filtered = leads.filter((lead) => {
      const text = `${lead.name || ""} ${lead.phone} ${lead.serviceInterest || ""} ${lead.programme || ""}`.toLowerCase();
      return (statusFilter === "ALL" || lead.status === statusFilter) && (priorityFilter === "ALL" || lead.priority === priorityFilter) && text.includes(needle);
    });
    return filtered.sort((a, b) => {
      if (leadSort === "recent") return activityTime(b) - activityTime(a);
      if (leadSort === "oldest") return activityTime(a) - activityTime(b);
      if (leadSort === "name") return (a.name || a.phone).localeCompare(b.name || b.phone);
      if (leadSort === "priority") return priorityRank(b.priority) - priorityRank(a.priority) || activityTime(b) - activityTime(a);
      return leadSortScore(b) - leadSortScore(a) || activityTime(b) - activityTime(a);
    });
  }, [leads, leadQuery, priorityFilter, statusFilter, leadSort]);
  const offerCategories = useMemo(() => ["All categories", ...Array.from(new Set(offers.map((offer) => offer.category))).sort()], [offers]);
  const visibleOffers = useMemo(() => offers.filter((offer) => {
    const text = `${offer.name} ${offer.category} ${offer.description}`.toLowerCase();
    return (offerCategory === "All categories" || offer.category === offerCategory) && text.includes(offerQuery.trim().toLowerCase());
  }), [offers, offerCategory, offerQuery]);

  const loadConversation = useCallback(async (leadId: string, quiet = false) => {
    if (conversationRefreshInFlight.current) return;
    conversationRefreshInFlight.current = true;
    if (!quiet) setConversationLoading(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/messages`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load this conversation.");
      setConversation(data as ConversationState);
      setLeads((current) => current.map((lead) => lead.id === data.lead.id ? data.lead : lead));
      if (!quiet) {
        setSender((data.lead.assignedTo as (typeof staffMembers)[number] | null) ?? staffMembers[0]);
        setNote(data.lead.internalNote ?? "");
      }
      setConversationError("");
    } catch (error) {
      if (!quiet) setConversationError(error instanceof Error ? error.message : "Unable to load this conversation.");
    } finally {
      conversationRefreshInFlight.current = false;
      if (!quiet) setConversationLoading(false);
    }
  }, []);

  const loadInbox = useCallback(async () => {
    if (inboxRefreshInFlight.current) return;
    inboxRefreshInFlight.current = true;
    try {
      const response = await fetch("/api/admin/leads", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) return;
      const nextLeads = data as Lead[];
      setLeads(nextLeads);
      setSelectedLeadId((current) => current && nextLeads.some((lead) => lead.id === current) ? current : (nextLeads[0]?.id ?? null));
    } catch {
      // Keep the current inbox visible if a background refresh briefly fails.
    } finally {
      inboxRefreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!selectedLeadId || tab !== "leads") return;
    void loadConversation(selectedLeadId);
    const refreshConversation = () => {
      if (document.visibilityState === "visible") void loadConversation(selectedLeadId, true);
    };
    const timer = window.setInterval(refreshConversation, CONVERSATION_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshConversation();
    };
    window.addEventListener("focus", refreshConversation);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshConversation);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [selectedLeadId, tab, loadConversation]);

  useEffect(() => {
    if (tab !== "leads") return;
    void loadInbox();
    const refreshInbox = () => {
      if (document.visibilityState === "visible") void loadInbox();
    };
    const timer = window.setInterval(refreshInbox, INBOX_REFRESH_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshInbox();
    };
    window.addEventListener("focus", refreshInbox);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshInbox);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [tab, loadInbox]);

  async function patchLead(id: string, patch: Partial<Pick<Lead, "status" | "aiPaused" | "assignedTo" | "internalNote" | "priority" | "followUpAt">>) {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update the client.");
      const updated = data as Lead;
      setLeads((current) => current.map((lead) => lead.id === id ? updated : lead));
      setConversation((current) => current?.lead.id === id ? { ...current, lead: updated } : current);
      setConversationError("");
      return updated;
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "Unable to update the client.");
      return null;
    } finally { setSaving(false); }
  }

  async function sendHumanReply() {
    if (!conversation || !replyText.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/leads/${conversation.lead.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: replyText, sender }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to send the reply.");
      setConversation(data as ConversationState);
      setLeads((current) => current.map((lead) => lead.id === data.lead.id ? data.lead : lead));
      setReplyText("");
      setConversationError("");
      setConversationNotice(data.delivery?.status === "accepted" ? "Reply accepted by Meta for WhatsApp delivery." : "Simulator reply saved. No WhatsApp message was sent.");
    } catch (error) {
      setConversationNotice("");
      setConversationError(error instanceof Error ? error.message : "Unable to send the reply.");
    }
    finally { setSaving(false); }
  }

  async function saveOffer(offer: Offer) {
    const response = await fetch("/api/admin/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(offer) });
    if (!response.ok) return;
    const updated = await response.json() as Offer;
    setOffers((current) => current.map((item) => item.slug === updated.slug ? updated : item));
  }

  function exportLeads() {
    const headings = ["Name", "Phone", "Service", "Programme", "Institution", "Deadline", "Status", "Priority", "Follow-up", "Assigned to", "AI paused", "Last message", "Record updated"];
    const rows = filteredLeads.map((lead) => [lead.name, lead.phone, lead.serviceInterest, lead.programme, lead.institution, lead.deadline, lead.status, lead.priority, lead.followUpAt, lead.assignedTo, lead.aiPaused ? "Yes" : "No", lead.lastMessageAt, lead.updatedAt]);
    const csv = [headings, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `medminds-leads-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); window.location.href = "/"; }

  return <main className="dashboard">
    <aside className="sidebar">
      <Link href="/" className="brand sidebarLogo" aria-label="MedMinds Learning Centre home"><BrandLogo priority compact /></Link>
      <nav aria-label="Admin sections">
        <button className={tab === "leads" ? "active" : ""} onClick={() => setTab("leads")}><span>Inbox</span><b>{humanManaged || ""}</b></button>
        <button className={tab === "offers" ? "active" : ""} onClick={() => setTab("offers")}>Offers and pricing</button>
        <button className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>Configuration</button>
      </nav>
      <button className="logout" onClick={logout}>Sign out</button>
    </aside>
    <section className="dashboardMain">
      <header className="dashboardHeader"><div><span className="kicker">Sales operations</span><h1>{tab === "leads" ? "Client inbox" : tab === "offers" ? "Approved offers" : "Configuration"}</h1></div><span className={`setupBadge ${setup.whatsappConfigured ? "ready" : "pending"}`}>{setup.whatsappConfigured ? "WhatsApp ready" : "Setup pending"}</span></header>

      {tab === "leads" && <>
        <div className="metricGrid"><div><span>Total leads</span><strong>{leads.length}</strong></div><div><span>Conversion</span><strong>{conversion}%</strong></div><div><span>Needs attention</span><strong>{followUps}</strong></div><div><span>Follow-ups due</span><strong>{dueFollowUps}</strong></div><div><span>Human managed</span><strong>{humanManaged}</strong></div></div>
        <div className="pipeline">{counts.filter((item) => item.count > 0).map((item) => <button key={item.status} onClick={() => setStatusFilter(item.status)}>{item.status}<strong>{item.count}</strong></button>)}</div>
        <div className="leadToolbar">
          <input value={leadQuery} onChange={(event) => setLeadQuery(event.target.value)} placeholder="Search name, number, service or programme" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="ALL">All priorities</option>{leadPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
          <select aria-label="Sort conversations" value={leadSort} onChange={(event) => setLeadSort(event.target.value as LeadSort)}><option value="smart">Smart priority</option><option value="recent">Most recent chat</option><option value="oldest">Oldest chat</option><option value="priority">Priority</option><option value="name">Client name</option></select>
          <button className="button buttonGhost" onClick={exportLeads}>Export CSV</button>
        </div>
        <div className="inboxLayout">
          <section className="leadList" aria-label="Client conversations">
            <div className="leadListTop"><strong>{filteredLeads.length} clients</strong><span>Live · message activity</span></div>
            {filteredLeads.map((lead) => <button key={lead.id} className={`leadListItem ${selectedLeadId === lead.id ? "selected" : ""}`} onClick={() => setSelectedLeadId(lead.id)}>
              <span className="clientAvatar">{initials(lead.name)}</span>
              <span className="leadListCopy"><strong>{lead.name || "Unnamed client"}</strong><small>{lead.serviceInterest || "Service not established"}</small><em title={activityTitle(lead)}>{lead.phone} · {lead.followUpAt ? `${followUpLabel(lead.followUpAt)} · ` : ""}{lead.lastMessageAt ? `Last message ${relativeTime(lead.lastMessageAt)}` : "No messages yet"}</em></span>
              <span className="leadBadges"><span className={`priorityPill ${lead.priority.toLowerCase()}`}>{lead.priority}</span><span className={`statusPill ${lead.aiPaused ? "human" : "ai"}`}>{lead.aiPaused ? "Human" : "AI"}</span></span>
            </button>)}
            {!filteredLeads.length && <div className="emptyState"><strong>No matching clients</strong><p>Adjust the search or filters.</p></div>}
          </section>
          <ConversationPanel conversation={conversation} loading={conversationLoading} error={conversationError} notice={conversationNotice} sender={sender} note={note} replyText={replyText} saving={saving} onSender={setSender} onNote={setNote} onReply={setReplyText} onPatch={patchLead} onSend={sendHumanReply} />
        </div>
      </>}

      {tab === "offers" && <><div className="offerToolbar"><input value={offerQuery} onChange={(event) => setOfferQuery(event.target.value)} placeholder="Search services" /><select value={offerCategory} onChange={(event) => setOfferCategory(event.target.value)}>{offerCategories.map((category) => <option key={category}>{category}</option>)}</select><span>{visibleOffers.length} of {offers.length} services</span></div><div className="offerGrid">{visibleOffers.map((offer) => <OfferEditor key={offer.slug} offer={offer} onSave={saveOffer} />)}</div></>}
      {tab === "setup" && <div className="setupGrid"><SetupCard title="AI Gateway" ready={setup.aiConfigured} detail={setup.aiConfigured ? `Ready · ${setup.model}` : "Deploy to Vercel for OIDC, or add AI_GATEWAY_API_KEY."} /><SetupCard title="Lead database" ready={setup.database === "postgres"} detail={setup.database === "postgres" ? "Persistent Postgres storage is connected." : "Memory mode is temporary. Add DATABASE_URL before production use."} /><SetupCard title="WhatsApp Cloud API" ready={setup.whatsappConfigured} detail={setup.whatsappConfigured ? "Webhook verification and sending are configured." : `Missing: ${setup.missingWhatsApp.join(", ")}`} /><SetupCard title="Admin security" ready={setup.adminConfigured} detail={setup.adminConfigured ? "Password and signed sessions are configured." : "Add ADMIN_PASSWORD and SESSION_SECRET."} /><div className="webhookCard"><span>Webhook endpoint</span><code>/api/webhooks/whatsapp</code><p>Use this URL for Meta webhook verification and incoming events.</p></div></div>}
    </section>
  </main>;
}

function ConversationPanel(props: { conversation: ConversationState | null; loading: boolean; error: string; notice: string; sender: (typeof staffMembers)[number]; note: string; replyText: string; saving: boolean; onSender: (value: (typeof staffMembers)[number]) => void; onNote: (value: string) => void; onReply: (value: string) => void; onPatch: (id: string, patch: Partial<Pick<Lead, "status" | "aiPaused" | "assignedTo" | "internalNote" | "priority" | "followUpAt">>) => Promise<Lead | null>; onSend: () => Promise<void> }) {
  const { conversation, loading } = props;
  const timelineRef = useRef<HTMLDivElement>(null);
  const conversationId = conversation?.lead.id ?? null;
  const messageCount = conversation?.messages.length ?? 0;

  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [conversationId, messageCount]);

  if (loading && !conversation) return <section className="conversationPanel"><div className="panelState">Loading conversation...</div></section>;
  if (!conversation) return <section className="conversationPanel"><div className="panelState"><strong>Select a client</strong><p>Review their history and manage the conversation here.</p></div></section>;
  const lead = conversation.lead;
  const canFreeReply = lead.source !== "whatsapp" || conversation.replyWindow.open;
  const replyDisabled = !lead.aiPaused || !canFreeReply || !props.replyText.trim() || props.saving;

  function handleReplyShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !replyDisabled) {
      event.preventDefault();
      void props.onSend();
    }
  }

  return <section className="conversationPanel">
    <header className="conversationHeader"><div className="clientIdentity"><span className="clientAvatar large">{initials(lead.name)}</span><div><strong>{lead.name || "Unnamed client"}</strong><span>{lead.phone} · {lead.serviceInterest || "Service not established"}</span><small className="conversationLastActive">{lead.lastMessageAt ? `Last message ${relativeTime(lead.lastMessageAt)} · ${formatExactTime(lead.lastMessageAt)}` : "No messages recorded yet"}</small></div></div><div className="conversationActions"><button type="button" className="iconButton" onClick={() => navigator.clipboard.writeText(lead.phone)}>Copy number</button><a className="iconButton" href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Open WhatsApp</a></div></header>
    <div className="controlStrip"><label>Assigned to<select value={lead.assignedTo ?? ""} onChange={(event) => void props.onPatch(lead.id, { assignedTo: event.target.value ? event.target.value as Lead["assignedTo"] : null })}><option value="">Unassigned</option>{staffMembers.map((staff) => <option key={staff}>{staff}</option>)}</select></label><label>Status<select value={lead.status} onChange={(event) => void props.onPatch(lead.id, { status: event.target.value as Lead["status"] })}>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Priority<select value={lead.priority} onChange={(event) => void props.onPatch(lead.id, { priority: event.target.value as Lead["priority"] })}>{leadPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>{lead.aiPaused ? <button className="button resumeButton" disabled={props.saving} onClick={() => void props.onPatch(lead.id, { aiPaused: false, assignedTo: null, status: "FOLLOW-UP REQUIRED" })}>Resume AI</button> : <button className="button takeoverButton" disabled={props.saving} onClick={() => void props.onPatch(lead.id, { aiPaused: true, assignedTo: props.sender, status: "HUMAN ASSISTANCE REQUIRED" })}>Take over</button>}</div>
    <div className="conversationMeta"><span className={lead.aiPaused ? "humanMode" : "aiMode"}>{lead.aiPaused ? `AI paused${lead.assignedTo ? ` for ${lead.assignedTo}` : ""}` : "AI responding"}</span><span className={canFreeReply ? "windowOpen" : "windowClosed"}>{lead.source !== "whatsapp" ? "Simulator conversation" : conversation.replyWindow.open ? `Reply window open${conversation.replyWindow.expiresAt ? ` until ${new Date(conversation.replyWindow.expiresAt).toLocaleString()}` : ""}` : "24-hour window closed"}</span></div>
    <div className={`followUpTools ${isFollowUpDue(lead) ? "overdue" : ""}`}><label>Next follow-up<input type="datetime-local" value={toLocalDateTimeInput(lead.followUpAt)} onChange={(event) => void props.onPatch(lead.id, { followUpAt: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label><div><button type="button" onClick={() => void props.onPatch(lead.id, { followUpAt: futureIso(24), status: "FOLLOW-UP REQUIRED" })}>Tomorrow</button><button type="button" onClick={() => void props.onPatch(lead.id, { followUpAt: futureIso(72), status: "FOLLOW-UP REQUIRED" })}>In 3 days</button>{lead.followUpAt && <button type="button" onClick={() => void props.onPatch(lead.id, { followUpAt: null })}>Clear</button>}</div><span>{lead.followUpAt ? followUpLabel(lead.followUpAt) : "No follow-up scheduled"}</span></div>
    <div ref={timelineRef} className="messageTimeline" aria-live="polite" aria-label={`Conversation with ${lead.name || lead.phone}`}>{conversation.messages.map((message) => <MessageBubble key={message.id} message={message} />)}{!conversation.messages.length && <div className="emptyState"><p>No messages yet.</p></div>}</div>
    {props.error && <div className="conversationError">{props.error}</div>}
    {props.notice && <div className="conversationNotice">{props.notice}</div>}
    <details className="internalNoteDetails">
      <summary><span><strong>Internal note</strong><small>Visible only to administrators</small></span><b>{props.note ? "Saved context" : "Add note"}</b></summary>
      <div className="internalNote"><textarea aria-label="Internal note" value={props.note} maxLength={2000} onChange={(event) => props.onNote(event.target.value)} placeholder="Add context, a follow-up reminder or next action." /><button type="button" className="button buttonGhost" disabled={props.saving || props.note === (lead.internalNote ?? "")} onClick={() => void props.onPatch(lead.id, { internalNote: props.note || null })}>Save note</button></div>
    </details>
    <div className="replyComposer">
      <div className="composerTop"><label>Send as<select value={props.sender} onChange={(event) => props.onSender(event.target.value as (typeof staffMembers)[number])}>{staffMembers.map((staff) => <option key={staff}>{staff}</option>)}</select></label><span>{props.replyText.length}/4000</span></div>
      <div className="quickReplies" aria-label="Quick replies">{quickReplies.map((reply) => <button key={reply.label} type="button" onClick={() => props.onReply(reply.text)} disabled={!lead.aiPaused || !canFreeReply}>{reply.label}</button>)}</div>
      <div className="composerInputRow"><textarea aria-label="Reply to client" value={props.replyText} maxLength={4000} onChange={(event) => props.onReply(event.target.value)} onKeyDown={handleReplyShortcut} placeholder={lead.aiPaused ? "Write a personal reply..." : "Take over the conversation to reply as a human."} disabled={!lead.aiPaused || !canFreeReply} /><button type="button" className="button buttonPrimary sendReplyButton" disabled={replyDisabled} onClick={() => void props.onSend()}>{props.saving ? (lead.source === "whatsapp" ? "Sending..." : "Saving...") : (lead.source === "whatsapp" ? "Send reply" : "Add simulator reply")}</button></div>
      <div className="composerFooter"><small>{lead.source !== "whatsapp" ? "Simulator replies stay in the dashboard and are not sent through WhatsApp." : !canFreeReply ? "An approved Meta template is required before you can reply." : lead.aiPaused ? "The AI remains paused while you manage this conversation." : "Take over first to prevent simultaneous AI and human replies."}</small><span>Ctrl + Enter to send</span></div>
    </div>
  </section>;
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const humanMatch = message.content.match(/^\[Human: ([^\]]+)]\s*/);
  const content = humanMatch ? message.content.replace(humanMatch[0], "") : message.content;
  const kind = message.role === "user" ? "client" : humanMatch ? "human" : "agent";
  return <div className={`timelineRow ${kind}`}><div className="timelineBubble"><span>{kind === "client" ? "Client" : humanMatch ? humanMatch[1] : "MedMinds AI"}</span><p>{content}</p><time title={formatExactTime(message.createdAt)}>{formatMessageTime(message.createdAt)}</time></div></div>;
}

function OfferEditor({ offer, onSave }: { offer: Offer; onSave: (offer: Offer) => Promise<void> }) {
  const [draft, setDraft] = useState(offer); const [saved, setSaved] = useState(false);
  return <article className="offerCard"><div className="offerTop"><div><span>{draft.category}</span><h3>{draft.name}</h3></div><label className="switch"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /><span /></label></div><div className="priceGrid"><label>Standard price, ZMW (14 days)<input type="number" min="0" step="0.01" value={draft.priceZmw ?? ""} onChange={(e) => setDraft({ ...draft, priceZmw: e.target.value ? Number(e.target.value) : null })} placeholder="Human quote" /></label><label>Rush price, ZMW (under 14 days)<input type="number" min="0" step="0.01" value={draft.rushPriceZmw ?? ""} onChange={(e) => setDraft({ ...draft, rushPriceZmw: e.target.value ? Number(e.target.value) : null })} placeholder="Human quote" /></label></div><label>Description<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><label>Features, one per line<textarea value={draft.features.join("\n")} onChange={(e) => setDraft({ ...draft, features: e.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label><label>Payment instructions<textarea value={draft.paymentInstructions ?? ""} onChange={(e) => setDraft({ ...draft, paymentInstructions: e.target.value || null })} /></label><button className="button buttonPrimary" onClick={async () => { await onSave(draft); setSaved(true); setTimeout(() => setSaved(false), 1800); }} disabled={draft.active && !draft.paymentInstructions}>{saved ? "Saved" : "Save approved offer"}</button></article>;
}

function SetupCard({ title, ready, detail }: { title: string; ready: boolean; detail: string }) { return <article className="setupCard"><span className={ready ? "check ready" : "check"}>{ready ? "✓" : "!"}</span><div><h3>{title}</h3><p>{detail}</p></div></article>; }
function initials(name: string | null) { return name ? name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() : "?"; }
function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
function activityTime(lead: Lead) { return new Date(lead.lastMessageAt ?? lead.createdAt).getTime() || 0; }
function activityTitle(lead: Lead) { return lead.lastMessageAt ? `Last message: ${formatExactTime(lead.lastMessageAt)}. Record updated: ${formatExactTime(lead.updatedAt)}.` : `No message recorded. Lead created: ${formatExactTime(lead.createdAt)}.`; }
function formatExactTime(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : value; }
function formatMessageTime(value: string) { const date = new Date(value); if (!Number.isFinite(date.getTime())) return value; const today = new Date(); const sameDay = date.toDateString() === today.toDateString(); const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1); const dayLabel = sameDay ? "Today" : date.toDateString() === yesterday.toDateString() ? "Yesterday" : date.toLocaleDateString([], { month: "short", day: "numeric" }); return `${dayLabel}, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; }
function isFollowUpDue(lead: Lead) { return Boolean(lead.followUpAt && new Date(lead.followUpAt).getTime() <= Date.now() && !["CONVERTED", "LOST LEAD"].includes(lead.status)); }
function priorityRank(priority: Lead["priority"]) { return priority === "HOT" ? 3 : priority === "WARM" ? 2 : 1; }
function leadSortScore(lead: Lead) { return (isFollowUpDue(lead) ? 400 : 0) + (lead.priority === "HOT" ? 200 : lead.priority === "WARM" ? 100 : 0) + (lead.aiPaused ? 25 : 0); }
function futureIso(hours: number) { return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(); }
function toLocalDateTimeInput(value: string | null) { if (!value) return ""; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function followUpLabel(value: string) { const date = new Date(value); const label = date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); return date.getTime() <= Date.now() ? `Overdue ${label}` : `Due ${label}`; }
