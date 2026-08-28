"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";

function visibleConversationPanel() {
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".conversationPanel"));
  return panels.find((panel) => {
    const rect = panel.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || panels.at(-1) || null;
}

function compactHeaderMeta(panel: HTMLElement | null) {
  if (!panel) return "";
  const identityMeta = panel.querySelector<HTMLElement>(".clientIdentity > div > span")?.textContent || "";
  const phone = identityMeta.split("·")[0]?.trim() || "";
  const activity = panel.querySelector<HTMLElement>(".conversationLastActive")?.textContent || "";
  const match = activity.match(/Last message\s+(.+?)(?:\s+·|$)/i);
  const age = match?.[1]?.trim() || "";
  return [phone, age].filter(Boolean).join(" · ");
}

function clickInPanel(panel: HTMLElement | null, selector: string) {
  const target = panel?.querySelector<HTMLElement>(selector) || document.querySelector<HTMLElement>(selector);
  target?.click();
}

export function MobileChatHeaderMenu() {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  const [identityHost, setIdentityHost] = useState<HTMLElement | null>(null);
  const [compactMeta, setCompactMeta] = useState("");
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);

  const sync = useCallback(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    const nextPanel = visibleConversationPanel();
    setPanel((current) => current === nextPanel ? current : nextPanel);
    const nextActions = nextPanel?.querySelector<HTMLElement>(".conversationActions") || null;
    setActionsHost((current) => current === nextActions ? current : nextActions);
    const nextIdentity = nextPanel?.querySelector<HTMLElement>(".clientIdentity > div") || null;
    setIdentityHost((current) => current === nextIdentity ? current : nextIdentity);
    setCompactMeta(compactHeaderMeta(nextPanel));
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    sync();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(sync, 2500);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sync]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const available = useMemo(() => {
    void revision;
    return {
      profilePhoto: Boolean(panel?.querySelector(".conversationHeader .clientAvatar.large")),
      whatsapp: Boolean(panel?.querySelector('a.iconButton[href^="https://wa.me/"]')),
      templates: Boolean(panel?.querySelector('[aria-label="Open approved Meta templates"]')),
      documents: Boolean(panel?.querySelector(".conversationDocumentsButton")),
      controls: Boolean(panel?.querySelector(".mobileToolsButton")),
      search: Boolean(panel?.querySelector(".mobileClientSearchButton"))
    };
  }, [panel, revision]);

  function run(selector: string) {
    setOpen(false);
    window.setTimeout(() => clickInPanel(panel, selector), 30);
  }

  if (!actionsHost || !identityHost) return null;

  const trigger = createPortal(
    <button type="button" className="mobileHeaderMenuButton" aria-label="More chat actions" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">⋮</span>
    </button>,
    actionsHost
  );

  const meta = compactMeta ? createPortal(<span className="mobileHeaderCompactMeta">{compactMeta}</span>, identityHost) : null;

  const menu = open ? createPortal(
    <div className="mobileHeaderMenuOverlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="mobileHeaderMenuSheet" role="dialog" aria-modal="true" aria-label="Chat actions">
        <header><div><strong>Chat actions</strong><small>Choose what you want to do</small></div><button type="button" aria-label="Close chat actions" onClick={() => setOpen(false)}>×</button></header>
        <div className="mobileHeaderMenuGrid">
          {available.profilePhoto && <button type="button" onClick={() => run(".conversationHeader .clientAvatar.large")}><span>◉</span><strong>Profile photo</strong><small>Add or replace client photo</small></button>}
          {available.templates && <button type="button" onClick={() => run('[aria-label="Open approved Meta templates"]')}><span>▣</span><strong>Templates</strong><small>Send approved Meta message</small></button>}
          {available.documents && <button type="button" onClick={() => run(".conversationDocumentsButton")}><span>▤</span><strong>Documents</strong><small>Shared files and quotations</small></button>}
          {available.whatsapp && <button type="button" onClick={() => run('a.iconButton[href^="https://wa.me/"]')}><span>WA</span><strong>WhatsApp</strong><small>Open client in WhatsApp</small></button>}
          {available.search && <button type="button" onClick={() => run(".mobileClientSearchButton")}><span>⌕</span><strong>Search</strong><small>Find another client</small></button>}
          {available.controls && <button type="button" onClick={() => run(".mobileToolsButton")}><span>⚙</span><strong>Client controls</strong><small>Status, follow-up and chat tools</small></button>}
        </div>
      </section>
    </div>,
    document.body
  ) : null;

  return <>{trigger}{meta}{menu}</>;
}
