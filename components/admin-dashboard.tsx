"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { getSetupState } from "@/lib/env";
import { leadStatuses, type Lead, type Offer } from "@/lib/types";

type Setup = ReturnType<typeof getSetupState>;

export function AdminDashboard({ initialLeads, initialOffers, setup }: { initialLeads: Lead[]; initialOffers: Offer[]; setup: Setup }) {
  const [leads, setLeads] = useState(initialLeads);
  const [offers, setOffers] = useState(initialOffers);
  const [tab, setTab] = useState<"leads" | "offers" | "setup">("leads");
  const converted = leads.filter((lead) => lead.status === "CONVERTED").length;
  const followUps = leads.filter((lead) => lead.status === "FOLLOW-UP REQUIRED" || lead.status === "HUMAN ASSISTANCE REQUIRED").length;
  const activeOffers = offers.filter((offer) => offer.active).length;
  const conversion = leads.length ? Math.round((converted / leads.length) * 100) : 0;
  const counts = useMemo(() => leadStatuses.map((status) => ({ status, count: leads.filter((lead) => lead.status === status).length })), [leads]);

  async function updateStatus(id: string, status: Lead["status"]) {
    const response = await fetch(`/api/admin/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) return;
    const updated = await response.json() as Lead;
    setLeads((current) => current.map((lead) => lead.id === id ? updated : lead));
  }

  async function saveOffer(offer: Offer) {
    const response = await fetch("/api/admin/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(offer) });
    if (!response.ok) return;
    const updated = await response.json() as Offer;
    setOffers((current) => current.map((item) => item.slug === updated.slug ? updated : item));
  }

  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); window.location.href = "/"; }

  return <main className="dashboard">
    <aside className="sidebar"><Link href="/" className="brand"><span className="brandMark">M</span><span>MedMinds</span></Link><nav><button className={tab === "leads" ? "active" : ""} onClick={() => setTab("leads")}>Leads</button><button className={tab === "offers" ? "active" : ""} onClick={() => setTab("offers")}>Offers and pricing</button><button className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>Configuration</button></nav><button className="logout" onClick={logout}>Sign out</button></aside>
    <section className="dashboardMain">
      <header className="dashboardHeader"><div><span className="kicker">Sales operations</span><h1>{tab === "leads" ? "Lead pipeline" : tab === "offers" ? "Approved offers" : "Configuration"}</h1></div><span className={`setupBadge ${setup.whatsappConfigured ? "ready" : "pending"}`}>{setup.whatsappConfigured ? "WhatsApp ready" : "Setup pending"}</span></header>
      {tab === "leads" && <>
        <div className="metricGrid"><div><span>Total leads</span><strong>{leads.length}</strong></div><div><span>Conversion</span><strong>{conversion}%</strong></div><div><span>Needs attention</span><strong>{followUps}</strong></div><div><span>Active offers</span><strong>{activeOffers}</strong></div></div>
        <div className="pipeline">{counts.filter((item) => item.count > 0).map((item) => <span key={item.status}>{item.status}<strong>{item.count}</strong></span>)}{!leads.length && <p>No leads yet. Use the simulator or connect WhatsApp to begin.</p>}</div>
        <div className="tableCard"><table><thead><tr><th>Client</th><th>Interest</th><th>Programme</th><th>Updated</th><th>Status</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><strong>{lead.name || "Unnamed lead"}</strong><small>{lead.phone}</small></td><td>{lead.serviceInterest || "Not established"}</td><td>{lead.programme || "—"}</td><td>{new Date(lead.updatedAt).toLocaleDateString()}</td><td><select value={lead.status} onChange={(event) => updateStatus(lead.id, event.target.value as Lead["status"])}>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>
      </>}
      {tab === "offers" && <div className="offerGrid">{offers.map((offer) => <OfferEditor key={offer.slug} offer={offer} onSave={saveOffer} />)}</div>}
      {tab === "setup" && <div className="setupGrid">
        <SetupCard title="AI Gateway" ready={setup.aiConfigured} detail={setup.aiConfigured ? `Ready · ${setup.model}` : "Deploy to Vercel for OIDC, or add AI_GATEWAY_API_KEY."} />
        <SetupCard title="Lead database" ready={setup.database === "postgres"} detail={setup.database === "postgres" ? "Persistent Postgres storage is connected." : "Memory mode is temporary. Add DATABASE_URL before production use."} />
        <SetupCard title="WhatsApp Cloud API" ready={setup.whatsappConfigured} detail={setup.whatsappConfigured ? "Webhook verification and sending are configured." : `Missing: ${setup.missingWhatsApp.join(", ")}`} />
        <SetupCard title="Admin security" ready={setup.adminConfigured} detail={setup.adminConfigured ? "Password and signed sessions are configured." : "Add ADMIN_PASSWORD and SESSION_SECRET."} />
        <div className="webhookCard"><span>Webhook endpoint</span><code>/api/webhooks/whatsapp</code><p>Use this URL for both Meta webhook verification and incoming events.</p></div>
      </div>}
    </section>
  </main>;
}

function OfferEditor({ offer, onSave }: { offer: Offer; onSave: (offer: Offer) => Promise<void> }) {
  const [draft, setDraft] = useState(offer); const [saved, setSaved] = useState(false);
  return <article className="offerCard"><div className="offerTop"><div><span>{draft.category}</span><h3>{draft.name}</h3></div><label className="switch"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /><span /></label></div>
    <label>Price (ZMW)<input type="number" min="0" step="0.01" value={draft.priceZmw ?? ""} onChange={(e) => setDraft({ ...draft, priceZmw: e.target.value ? Number(e.target.value) : null })} placeholder="Required before activation" /></label>
    <label>Description<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
    <label>Features, one per line<textarea value={draft.features.join("\n")} onChange={(e) => setDraft({ ...draft, features: e.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
    <label>Payment instructions<textarea value={draft.paymentInstructions ?? ""} onChange={(e) => setDraft({ ...draft, paymentInstructions: e.target.value || null })} placeholder="Approved link or instructions" /></label>
    <button className="button buttonPrimary" onClick={async () => { await onSave(draft); setSaved(true); setTimeout(() => setSaved(false), 1800); }} disabled={draft.active && (draft.priceZmw === null || !draft.paymentInstructions)}>{saved ? "Saved" : "Save approved offer"}</button>
  </article>;
}

function SetupCard({ title, ready, detail }: { title: string; ready: boolean; detail: string }) { return <article className="setupCard"><span className={ready ? "check ready" : "check"}>{ready ? "✓" : "!"}</span><div><h3>{title}</h3><p>{detail}</p></div></article>; }

