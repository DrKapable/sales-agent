"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand-logo";

export function MobileAdminEnhancer() {
  const [active, setActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("Chats");
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [controlsTarget, setControlsTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    sidebar?.classList.toggle("mobileOpen", active && menuOpen);
    if (!active) setMenuOpen(false);
  }, [active, menuOpen]);

  useEffect(() => {
    const syncTargets = () => {
      const dashboard = document.querySelector<HTMLElement>(".dashboard");
      const actions = document.querySelector<HTMLElement>(".conversationPanel .conversationActions");
      const header = document.querySelector<HTMLElement>(".conversationPanel .conversationHeader");
      const controls = document.querySelector<HTMLElement>(".conversationPanel .controlStrip");
      setActive(Boolean(dashboard));
      setActionsTarget((current) => current === actions ? current : actions);
      setHeaderTarget((current) => current === header ? current : header);
      setControlsTarget((current) => current === controls ? current : controls);
    };

    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });

    const handleDashboardClick = (event: Event) => {
      const target = event.target as Element | null;
      if (!target) return;

      const navButton = target.closest<HTMLElement>(".sidebar nav button");
      if (navButton) {
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

  if (!active) return null;

  return <>
    <div className="mobileAdminBar" aria-label="Agent Admin mobile navigation">
      <button type="button" className="mobileMenuButton" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span /><span /><span /></button>
      <div className="mobileAdminLogo"><BrandLogo priority compact /></div>
      <strong>{sectionTitle}</strong>
    </div>
    <button type="button" className={`mobileMenuBackdrop ${menuOpen ? "show" : ""}`} aria-label="Close menu" onClick={() => setMenuOpen(false)} />
    {headerTarget && chatOpen ? createPortal(
      <button type="button" className="mobileChatBack" aria-label="Back to chats" onClick={() => { setChatOpen(false); setToolsOpen(false); }}>←</button>,
      headerTarget
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
  </>;
}
