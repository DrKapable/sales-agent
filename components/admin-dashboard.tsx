"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { getSetupState } from "@/lib/env";
import { leadStatuses, type ConversationMessage, type Lead, type Offer } from "@/lib/types";

type Setup = ReturnType<typeof getSetupState>;
type ConversationState = { lead: Lead; messages: ConversationMessage[]; replyWindow: { open: boolean; expiresAt: string | null } };
type Tab = "leads" | "offers" | "setup";
const staffMembers = ["Dr. Mustafa Juma Phiri", "Dr Kanyembo Ng'andwe"] as const;

export function AdminDashboard({ initialLeads, initialOffers, setup }: { initialLeads: Lead[]; initialOffers: Offer[]; setup: Setup }) {
  const [leads, setLeads] = useState(initialLeads);
  const [offers, setOffers] = useState(initialOffers);
  const [tab, setTab] = useState<Tab>("leads");
  const [selectedLeadId, setSelectedLeadId] = useState(initialLeads[0]?.id ?? null);
  const [conversation, setConversation] = useState<ConversationState | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sender, setSender] = useState<(typeof staffMembers)[number]>(staffMembers[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [offerQuery, setOfferQuery] = useState("");
  const [offerCategory, setOfferCategory] = useState("All categories");

  const converted = leads.filter((lead) => lead.status === "CONVERTED").length;
  const humanManaged = leads.filter((lead) => lead.aiPaused).length;
  const followUps = leads.filter((lead) => lead.status === "FOLLOW-UP REQUIRED" || lead.status === "HUMAN ASSISTANCE REQUIRED").length;
  const conversion = leads.length ? Math.round((converted / leads.length) * 100) : 0;
  const counts = useMemo(() => leadStatuses.map((status) => ({ status, count: leads.filter((lead) => lead.status === status).length })), [leads]);
  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const text = `${lead.name || ""} ${lead.phone} ${lead.serviceInterest || ""} ${lead.programme || ""}`.toLowerCase();
    return (statusFilter === "ALL" || lead.status === statusFilter) && text.includes(leadQuery.trim().toLowerCase());
  }), [leads, leadQuery, statusFilter]);
  const offerCategories = useMemo(() => ["All categories", ...Array.from(new Set(offers.map((offer) => offer.category))).sort()], [offers]);
  const visibleOffers = useMemo(() => offers.filter((offer) => {
    const text = `${offer.name} ${offer.category} ${offer.description}`.toLowerCase();
    return (offerCategory === "All categories" || offer.category === offerCategory) && text.includes(offerQuery.trim().toLowerCase());
  }), [offers, offerCategory, offerQuery]);

  const loadConversation = useCallback(async (leadId: string, quiet = false) => {
    if (!quiet) setConversationLoading(true);
    try {
      const response = await fetch(`/api/admin/leads/${leadId}/messages`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load this conversation.");
      setConversation(data as ConversationState);
      setLeads((current) => current.map((lead) => lead.id === data.lead.id ? data.lead : lead));
      setSender((data.lead.assignedTo as (typeof staffMembers)[number] | null) ?? staffMembers[0]);
      setNote(data.lead.internalNote ?? "");
      setConversationError("");
    } catch (error) {
      if (!quiet) setConversationError(error instanceof Error ? error.message : "Unable to load this conversation.");
    } finally {
      if (!quiet) setConversationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedLeadId || tab !== "leads") return;
    void loadConversation(selectedLeadId);
    const timer = window.setInterval(() => void loadConversation(selectedLeadId, true), 15000);
    return () => window.clearInterval(timer);
  }, [selectedLeadId, tab, loadConversation]);

  async function patchLead(id: string, patch: Partial<Pick<Lead, "status" | "aiPaused" | "assignedTo" | "internalNote">>) {
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
    } catch (error) { setConversationError(error instanceof Error ? error.message : "Unable to send the reply."); }
    finally { setSaving(false); }
  }

  async function saveOffer(offer: Offer) {
    const response = await fetch("/api/admin/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(offer) });
    if (!response.ok) return;
    const updated = await response.json() as Offer;
    setOffers((current) => current.map((item) => item.slug === updated.slug ? updated : item));
  }

  function exportLeads() {
    const headings = ["Name", "Phone", "Service", "Programme", "Institution", "Deadline", "Status", "Assigned to", "AI paused", "Updated"];
    const rows = filteredLeads.map((lead) => [lead.name, lead.phone, lead.serviceInterest, lead.programme, lead.institution, lead.deadline, lead.status, lead.assignedTo, lead.aiPaused ? "Yes" : "No", lead.updatedAt]);
    const csv = [headings, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `medminds-leads-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); window.location.href = "/"; }

  return <main className="dashboard">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brandMark">M</span><span>MedMinds</span></Link>
      <nav>
        <button className={tab === "leads" ? "active" : ""} onClick={() => setTab("leads")}><span>Inbox</span><b>{humanManaged || ""}</b></button>
        <button className={tab === "offers" ? "active" : ""} onClick={() => setTab("offers")}>Offers and pricing</button>
        <button className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>Configuration</button>
      </nav>
      <button className="logout" onClick={logout}>Sign out</button>
    </aside>
    <section className="dashboardMain">
      <header className="dashboardHeader"><div><span className="kicker">Sales operations</span><h1>{tab === "leads" ? "Client inbox" : tab === "offers" ? "Approved offers" : "Configuration"}</h1></div><span className={`setupBadge ${setup.whatsappConfigured ? "ready" : "pending"}`}>{setup.whatsappConfigured ? "WhatsApp ready" : "Setup pending"}</span></header>

      {tab === "leads" && <>
        <div className="metricGrid"><div><span>Total leads</span><strong>{leads.length}</strong></div><div><span>Conversion</span><strong>{conversion}%</strong></div><div><span>Needs attention</span><strong>{followUps}</strong></div><div><span>Human managed</span><strong>{humanManaged}</strong></div></div>
        <div className="pipeline">{counts.filter((item) => item.count > 0).map((item) => <button key={item.status} onClick={() => setStatusFilter(item.status)}>{item.status}<strong>{item.count}</strong></button>)}</div>
        <div className="leadToolbar"><input value={leadQuery} onChange={(event) => setLeadQuery(event.target.value)} placeholder="Search name, number, service or programme" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select><button className="button buttonGhost" onClick={exportLeads}>Export CSV</button></div>
        <div className="inboxLayout">
          <section className="leadList" aria-label="Client conversations">
            <div className="leadListTop"><strong>{filteredLeads.length} clients</strong><span>Auto-refreshing</span></div>
            {filteredLeads.map((lead) => <button key={lead.id} className={`leadListItem ${selectedLeadId === lead.id ? "selected" : ""}`} onClick={() => setSelectedLeadId(lead.id)}>
              <span className="clientAvatar">{initials(lead.name)}</span><span className="leadListCopy"><strong>{lead.name || "Unnamed client"}</strong><small>{lead.serviceInterest || "Service not established"}</small><em>{lead.phone} · {relativeTime(lead.updatedAt)}</em></span><span className={`statusPill ${lead.aiPaused ? "human" : "ai"}`}>{lead.aiPaused ? "Human" : "AI"}</span>
            </button>)}
            {!filteredLeads.length && <div className="emptyState"><strong>No matching clients</strong><p>Adjust the search or status filter.</p></div>}
          </section>
          <ConversationPanel conversation={conversation} loading={conversationLoading} error={conversationError} sender={sender} note={note} replyText={replyText} saving={saving} onSender={setSender} onNote={setNote} onReply={setReplyText} onPatch={patchLead} onSend={sendHumanReply} />
        </div>
      </>}

      {tab === "offers" && <><div className="offerToolbar"><input value={offerQuery} onChange={(event) => setOfferQuery(event.target.value)} placeholder="Search services" /><select value={offerCategory} onChange={(event) => setOfferCategory(event.target.value)}>{offerCategories.map((category) => <option key={category}>{category}</option>)}</select><span>{visibleOffers.length} of {offers.length} services</span></div><div className="offerGrid">{visibleOffers.map((offer) => <OfferEditor key={offer.slug} offer={offer} onSave={saveOffer} />)}</div></>}
      {tab === "setup" && <div className="setupGrid"><SetupCard title="AI Gateway" ready={setup.aiConfigured} detail={setup.aiConfigured ? `Ready · ${setup.model}` : "Deploy to Vercel for OIDC, or add AI_GATEWAY_API_KEY."} /><SetupCard title="Lead database" ready={setup.database === "postgres"} detail={setup.database === "postgres" ? "Persistent Postgres storage is connected." : "Memory mode is temporary. Add DATABASE_URL before production use."} /><SetupCard title="WhatsApp Cloud API" ready={setup.whatsappConfigured} detail={setup.whatsappConfigured ? "Webhook verification and sending are configured." : `Missing: ${setup.missingWhatsApp.join(", ")}`} /><SetupCard title="Admin security" ready={setup.adminConfigured} detail={setup.adminConfigured ? "Password and signed sessions are configured." : "Add ADMIN_PASSWORD and SESSION_SECRET."} /><div className="webhookCard"><span>Webhook endpoint</span><code>/api/webhooks/whatsapp</code><p>Use this URL for Meta webhook verification and incoming events.</p></div></div>}
    </section>
  </main>;
}

function ConversationPanel(props: { conversation: ConversationState | null; loading: boolean; error: string; sender: (typeof staffMembers)[number]; note: string; replyText: string; saving: boolean; onSender: (value: (typeof staffMembers)[number]) => void; onNote: (value: string) => void; onReply: (value: string) => void; onPatch: (id: string, patch: Partial<Pick<Lead, "status" | "aiPaused" | "assignedTo" | "internalNote">>) => Promise<Lead | null>; onSend: () => Promise<void> }) {
  const { conversation, loading } = props;
  if (loading && !conversation) return <section className="conversationPanel"><div className="panelState">Loading conversation...</div></section>;
  if (!conversation) return <section className="conversationPanel"><div className="panelState"><strong>Select a client</strong><p>Review their history and manage the conversation here.</p></div></section>;
  const lead = conversation.lead;
  const canFreeReply = lead.source !== "whatsapp" || conversation.replyWindow.open;
  return <section className="conversationPanel">
    <header className="conversationHeader"><div className="clientIdentity"><span className="clientAvatar large">{initials(lead.name)}</span><div><strong>{lead.name || "Unnamed client"}</strong><span>{lead.phone} · {lead.serviceInterest || "Service not established"}</span></div></div><div className="conversationActions"><button className="iconButton" onClick={() => navigator.clipboard.writeText(lead.phone)}>Copy number</button><a className="iconButton" href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Open WhatsApp</a></div></header>
    <div className="controlStrip"><label>Assigned to<select value={lead.assignedTo ?? ""} onChange={(event) => void props.onPatch(lead.id, { assignedTo: event.target.value ? event.target.value as Lead["assignedTo"] : null })}><option value="">Unassigned</option>{staffMembers.map((staff) => <option key={staff}>{staff}</option>)}</select></label><label>Status<select value={lead.status} onChange={(event) => void props.onPatch(lead.id, { status: event.target.value as Lead["status"] })}>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>{lead.aiPaused ? <button className="button resumeButton" disabled={props.saving} onClick={() => void props.onPatch(lead.id, { aiPaused: false, assignedTo: null, status: "FOLLOW-UP REQUIRED" })}>Resume AI</button> : <button className="button takeoverButton" disabled={props.saving} onClick={() => void props.onPatch(lead.id, { aiPaused: true, assignedTo: props.sender, status: "HUMAN ASSISTANCE REQUIRED" })}>Take over</button>}</div>
    <div className="conversationMeta"><span className={lead.aiPaused ? "humanMode" : "aiMode"}>{lead.aiPaused ? `AI paused${lead.assignedTo ? ` for ${lead.assignedTo}` : ""}` : "AI responding"}</span><span className={canFreeReply ? "windowOpen" : "windowClosed"}>{lead.source !== "whatsapp" ? "Simulator conversation" : conversation.replyWindow.open ? `Reply window open${conversation.replyWindow.expiresAt ? ` until ${new Date(conversation.replyWindow.expiresAt).toLocaleString()}` : ""}` : "24-hour window closed"}</span></div>
    <div className="messageTimeline">{conversation.messages.map((message) => <MessageBubble key={message.id} message={message} />)}{!conversation.messages.length && <div className="emptyState"><p>No messages yet.</p></div>}</div>
    {props.error && <div className="conversationError">{props.error}</div>}
    <div className="replyComposer"><div className="composerTop"><label>Send as<select value={props.sender} onChange={(event) => props.onSender(event.target.value as (typeof staffMembers)[number])}>{staffMembers.map((staff) => <option key={staff}>{staff}</option>)}</select></label><span>{props.replyText.length}/4000</span></div><textarea value={props.replyText} maxLength={4000} onChange={(event) => props.onReply(event.target.value)} placeholder={lead.aiPaused ? "Write a personal reply..." : "Take over the conversation to reply as a human."} disabled={!lead.aiPaused || !canFreeReply} /><div className="composerFooter"><small>{!canFreeReply ? "An approved Meta template is required before you can reply." : lead.aiPaused ? "The AI remains paused while you manage this conversation." : "Take over first to prevent simultaneous AI and human replies."}</small><button className="button buttonPrimary" disabled={!lead.aiPaused || !canFreeReply || !props.replyText.trim() || props.saving} onClick={() => void props.onSend()}>{props.saving ? "Sending..." : "Send reply"}</button></div></div>
    <div className="internalNote"><div><strong>Internal note</strong><span>Visible only to administrators</span></div><textarea value={props.note} maxLength={2000} onChange={(event) => props.onNote(event.target.value)} placeholder="Add context, a follow-up reminder or next action." /><button className="button buttonGhost" disabled={props.saving || props.note === (lead.internalNote ?? "")} onClick={() => void props.onPatch(lead.id, { internalNote: props.note || null })}>Save note</button></div>
  </section>;
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const humanMatch = message.content.match(/^\[Human: ([^\]]+)]\s*/);
  const content = humanMatch ? message.content.replace(humanMatch[0], "") : message.content;
  const kind = message.role === "user" ? "client" : humanMatch ? "human" : "agent";
  return <div className={`timelineRow ${kind}`}><div className="timelineBubble"><span>{kind === "client" ? "Client" : humanMatch ? humanMatch[1] : "MedMinds AI"}</span><p>{content}</p><time>{new Date(message.createdAt).toLocaleString()}</time></div></div>;
}

function OfferEditor({ offer, onSave }: { offer: Offer; onSave: (offer: Offer) => Promise<void> }) {
  const [draft, setDraft] = useState(offer); const [saved, setSaved] = useState(false);
  return <article className="offerCard"><div className="offerTop"><div><span>{draft.category}</span><h3>{draft.name}</h3></div><label className="switch"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /><span /></label></div><div className="priceGrid"><label>Standard price, ZMW (14 days)<input type="number" min="0" step="0.01" value={draft.priceZmw ?? ""} onChange={(e) => setDraft({ ...draft, priceZmw: e.target.value ? Number(e.target.value) : null })} placeholder="Human quote" /></label><label>Rush price, ZMW (under 14 days)<input type="number" min="0" step="0.01" value={draft.rushPriceZmw ?? ""} onChange={(e) => setDraft({ ...draft, rushPriceZmw: e.target.value ? Number(e.target.value) : null })} placeholder="Human quote" /></label></div><label>Description<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><label>Features, one per line<textarea value={draft.features.join("\n")} onChange={(e) => setDraft({ ...draft, features: e.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label><label>Payment instructions<textarea value={draft.paymentInstructions ?? ""} onChange={(e) => setDraft({ ...draft, paymentInstructions: e.target.value || null })} /></label><button className="button buttonPrimary" onClick={async () => { await onSave(draft); setSaved(true); setTimeout(() => setSaved(false), 1800); }} disabled={draft.active && !draft.paymentInstructions}>{saved ? "Saved" : "Save approved offer"}</button></article>;
}

function SetupCard({ title, ready, detail }: { title: string; ready: boolean; detail: string }) { return <article className="setupCard"><span className={ready ? "check ready" : "check"}>{ready ? "✓" : "!"}</span><div><h3>{title}</h3><p>{detail}</p></div></article>; }
function initials(name: string | null) { return name ? name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() : "?"; }
function relativeTime(value: string) { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)); if (minutes < 1) return "now"; if (minutes < 60) return `${minutes}m`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h`; return `${Math.round(hours / 24)}d`; }
