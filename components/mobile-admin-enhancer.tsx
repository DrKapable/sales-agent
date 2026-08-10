"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand-logo";

export function MobileAdminEnhancer() {
  const [active, setActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    sidebar?.classList.toggle("mobileOpen", active && menuOpen);
    if (!active) setMenuOpen(false);
  }, [active, menuOpen]);

  useEffect(() => {
    const syncTargets = () => {
      const dashboard = document.querySelector<HTMLElement>(".dashboard");
      const actions = document.querySelector<HTMLElement>(".conversationPanel .conversationActions");
      setActive(Boolean(dashboard));
      setActionsTarget((current) => current === actions ? current : actions);
    };

    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });

    const closeDrawer = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest(".sidebar nav button, .sidebar .logout, .sidebarLogo")) setMenuOpen(false);
    };
    document.addEventListener("click", closeDrawer);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", closeDrawer);
    };
  }, []);

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
      <strong>Agent Admin</strong>
    </div>
    <button type="button" className={`mobileMenuBackdrop ${menuOpen ? "show" : ""}`} aria-label="Close menu" onClick={() => setMenuOpen(false)} />
    {actionsTarget ? createPortal(<button type="button" className="mobileToolsButton" aria-expanded={toolsOpen} onClick={() => setToolsOpen((value) => !value)}>{toolsOpen ? "Hide controls" : "Client controls"}</button>, actionsTarget) : null}
  </>;
}
