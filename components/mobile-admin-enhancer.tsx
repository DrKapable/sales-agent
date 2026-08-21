"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand-logo";
import type { Lead } from "@/lib/types";

type ArchivedChat = { lead: Lead; archivedAt: string };

const FLOATING_SALES_CHAT_SELECTOR = 'iframe[title="Chat with Mary Kainda"]';

function setFloatingSalesChatHidden(hidden: boolean) {
  document.querySelectorAll<HTMLIFrameElement>(FLOATING_SALES_CHAT_SELECTOR).forEach((frame) => {
    if (hidden) {
      frame.dataset.medmindsAdminHidden = "true";
      frame.hidden = true;
      frame.style.display = "none";
      frame.setAttribute("aria-hidden", "true");
      return;
    }

    if (frame.dataset.medmindsAdminHidden !== "true") return;
    frame.hidden = false;
    frame.style.removeProperty("display");
    frame.removeAttribute("aria-hidden");
    frame.removeAttribute("data-medminds-admin-hidden");
  });
}

export function MobileAdminEnhancer() {
  const [active, setActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("Chats");
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [controlsTarget, setControlsTarget] = useState<HTMLElement | null>(null);
  const [navTarget, setNavTarget] = useState<HTMLElement | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivedChats, setArchivedChats] = useState<ArchivedChat[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    sidebar?.classList.toggle("mobileOpen", active && menuOpen);
    if (!active) setMenuOpen(false);
  }, [active, menuOpen]);

  useEffect(() => {
    const syncTargets = () => {
      const dashboard = document.querySelector<HTMLElement>(".dashboard");
      setFloatingSalesChatHidden(Boolean(dashboard));
      const actions = document.querySelector<HTMLElement>(".conversationPanel .conversationActions");
      const header = document.querySelector<HTMLElement>(".conversationPanel .conversationHeader");
      const controls = document.querySelector<HTMLElement>(".conversationPanel .controlStrip");
      const nav = document.querySelector<HTMLElement>(".sidebar nav");
      setActive(Boolean(dashboard));
      setActionsTarget((current) => current === actions ? current : actions);
      setHeaderTarget((current) => current === header ? current : header);
      setControlsTarget((current) => current === controls ? current : controls);
      setNavTarget((current) => current === nav ? current : nav);
    };

    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });

    const handleDashboardClick = (event: Event) => {
      const target = event.target as Element | null;
      if (!target) return;

      const navButton = target.closest<HTMLElement>(".sidebar nav button");
      if (navButton) {
        if (navButton.classList.contains("archivedNavButton")) {
          setMenuOpen(false);
          return;
        }
        const label = navButton.querySelector("span")?.textContent?.trim() || navButton.textContent?.trim() || "Agent Admin";
        setSectionTitle(label === "Inbox" ? "Chats" : label);
        setChatOpen(false);
        setToolsOpen(false);
        setMenuOpen(false);
      }

      if (target.closest(".sidebar .logout, .sidebarLogo")) setMenuOpen(false);

      if (target.closest(".leadListItem") && window.matchMedia("(max-width: 820px)").matches) {
        setToolsOpen(false);
        window.setTimeout(() => setChatOpen(true), 0);
      }
    };

    document.addEventListener("click", handleDashboardClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleDashboardClick);
      setFloatingSalesChatHidden(false);
    };
  }, []);

  useEffect(() => {
    const dashboard = document.querySelector<HTMLElement>(".dashboard");
    dashboard?.classList.toggle("mobileChatOpen", active && chatOpen);
    document.body.classList.toggle("mobileAdminChatOpen", active && chatOpen);
    return () => {
      dashboard?.classList.remove("mobileChatOpen");
      document.body.classList.remove("mobileAdminChatOpen");
    };
  }, [active, chatOpen]);

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(".conversationPanel");
    panel?.classList.toggle("mobileToolsOpen", active && toolsOpen);
    return () => panel?.classList.remove("mobileToolsOpen");
  }, [active, toolsOpen, actionsTarget]);

  useEffect(() => { setToolsOpen(false); }, [actionsTarget]);

  function searchClients() {
    setToolsOpen(false);
    setMenuOpen(false);
    setChatOpen(false);
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(".leadToolbar input");
      if (!input) return;
      input.scrollIntoView({ block: "start", behavior: "smooth" });
      input.focus({ preventScroll: true });
      input.select();
    }, 90);
  }

  function currentLead() {
    const identity = document.querySelector<HTMLElement>(".conversationPanel .clientIdentity");
    const phoneText = identity?.querySelector<HTMLElement>("div span")?.textContent || "";
    const phone = phoneText.split("·")[0]?.trim() || "";
    const name = identity?.querySelector<HTMLElement>("strong")?.textContent?.trim() || phone;
    return { phone, name };
  }

  async function runAction(phone: string, action: "archive" | "restore" | "delete") {
    const response = await fetch("/api/admin/leads/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, action })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to update this chat.");
  }

  async function manageCurrent(action: "archive" | "delete") {
    const lead = currentLead();
    if (!lead.phone || lifecycleBusy) return;
    const question = action === "archive"
      ? `Archive the chat with ${lead.name}? It will leave the active inbox and return automatically if the client messages again.`
      : `Permanently delete the chat with ${lead.name}? This removes the client record and message history and cannot be undone.`;
    if (!window.confirm(question)) return;
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      await runAction(lead.phone, action);
      window.location.reload();
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Unable to update this chat.");
      setLifecycleBusy(false);
    }
  }

  async function openArchivedChats() {
    setArchiveOpen(true);
    setArchiveLoading(true);
    setLifecycleError("");
    try {
      const response = await fetch("/api/admin/leads/manage", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load archived chats.");
      setArchivedChats(Array.isArray(data.chats) ? data.chats : []);
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Unable to load archived chats.");
    } finally {
      setArchiveLoading(false);
    }
  }

  async function manageArchived(chat: ArchivedChat, action: "restore" | "delete") {
    if (lifecycleBusy) return;
    if (action === "delete" && !window.confirm(`Permanently delete the archived chat with ${chat.lead.name || chat.lead.phone}? This cannot be undone.`)) return;
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      await runAction(chat.lead.phone, action);
      if (action === "restore") {
        window.location.reload();
        return;
      }
      setArchivedChats((current) => current.filter((item) => item.lead.phone !== chat.lead.phone));
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Unable to update this chat.");
    } finally {
      setLifecycleBusy(false);
    }
  }

  if (!active) return null;

  return <>
    <div className="mobileAdminBar" aria-label="Agent Admin mobile navigation">
      <button type="button" className="mobileMenuButton" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span /><span /><span /></button>
      <div className="mobileAdminLogo"><BrandLogo priority compact /></div>
      <strong>{sectionTitle}</strong>
    </div>
    <button type="button" className={`mobileMenuBackdrop ${menuOpen ? "show" : ""}`} aria-label="Close menu" onClick={() => setMenuOpen(false)} />

    {navTarget ? createPortal(
      <button type="button" className="archivedNavButton" onClick={() => void openArchivedChats()}><span>Archived chats</span></button>,
      navTarget
    ) : null}

    {headerTarget && chatOpen ? createPortal(
      <button type="button" className="mobileChatBack" aria-label="Back to chats" onClick={() => { setChatOpen(false); setToolsOpen(false); }}>←</button>,
      headerTarget
    ) : null}
    {actionsTarget && chatOpen ? createPortal(
      <button type="button" className="mobileClientSearchButton" aria-label="Search clients" title="Search clients" onClick={searchClients}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
      </button>,
      actionsTarget
    ) : null}
    {actionsTarget ? createPortal(
      <button type="button" className={`mobileToolsButton ${toolsOpen ? "isOpen" : ""}`} aria-label={toolsOpen ? "Close client controls" : "Open client controls"} aria-expanded={toolsOpen} title={toolsOpen ? "Close client controls" : "Client controls"} onClick={() => setToolsOpen((value) => !value)}>
        <span className="mobileToolsLabel">{toolsOpen ? "Close controls" : "Client controls"}</span><span className="mobileToolsDots" aria-hidden="true">{toolsOpen ? "×" : "⋮"}</span>
      </button>,
      actionsTarget
    ) : null}
    {controlsTarget && chatOpen && toolsOpen ? createPortal(
      <button type="button" className="mobileControlsClose" onClick={() => setToolsOpen(false)} aria-label="Close client controls">
        <span>Client controls</span><strong>Close ×</strong>
      </button>,
      controlsTarget
    ) : null}

    {controlsTarget ? createPortal(
      <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 }}>
        <button type="button" className="button buttonGhost" onClick={searchClients}>Search clients</button>
        <button type="button" className="button buttonGhost" disabled={lifecycleBusy} onClick={() => void manageCurrent("archive")}>Archive chat</button>
        <button type="button" className="button buttonGhost" disabled={lifecycleBusy} onClick={() => void openArchivedChats()}>Archived chats</button>
        <button type="button" className="button buttonGhost" disabled={lifecycleBusy} style={{ color: "#a62a2a", borderColor: "#e7bcbc" }} onClick={() => void manageCurrent("delete")}>Delete chat</button>
        {lifecycleError ? <span style={{ width: "100%", color: "#a62a2a", fontSize: 12 }}>{lifecycleError}</span> : null}
      </div>,
      controlsTarget
    ) : null}

    {archiveOpen ? createPortal(
      <div role="dialog" aria-modal="true" aria-label="Archived chats" style={{ position: "fixed", inset: 0, zIndex: 2147483500, background: "rgba(7,31,48,.62)", display: "grid", placeItems: "center", padding: 18 }} onClick={(event) => { if (event.target === event.currentTarget) setArchiveOpen(false); }}>
        <section style={{ width: "min(620px, 100%)", maxHeight: "82vh", overflow: "auto", background: "#fff", borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,.24)", padding: 20 }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <div><strong style={{ fontSize: 20 }}>Archived chats</strong><div style={{ color: "#61736f", fontSize: 12, marginTop: 3 }}>Restore a conversation or permanently delete it.</div></div>
            <button type="button" className="button buttonGhost" onClick={() => setArchiveOpen(false)}>Close ×</button>
          </header>
          {archiveLoading ? <p>Loading archived chats...</p> : archivedChats.length ? archivedChats.map((chat) => <article key={chat.lead.phone} style={{ borderTop: "1px solid #dce4e0", padding: "14px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
            <div><strong>{chat.lead.name || "Unnamed client"}</strong><div style={{ color: "#61736f", fontSize: 13, marginTop: 4 }}>{chat.lead.phone}{chat.lead.serviceInterest ? ` · ${chat.lead.serviceInterest}` : ""}</div><small style={{ color: "#82908d" }}>Archived {new Date(chat.archivedAt).toLocaleString()}</small></div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}><button type="button" className="button buttonSecondary" disabled={lifecycleBusy} onClick={() => void manageArchived(chat, "restore")}>Restore</button><button type="button" className="button buttonGhost" disabled={lifecycleBusy} style={{ color: "#a62a2a" }} onClick={() => void manageArchived(chat, "delete")}>Delete</button></div>
          </article>) : <p style={{ color: "#61736f" }}>No archived chats.</p>}
          {lifecycleError ? <p style={{ color: "#a62a2a", marginTop: 12 }}>{lifecycleError}</p> : null}
        </section>
      </div>,
      document.body
    ) : null}
  </>;
}