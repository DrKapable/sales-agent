"use client";

import { useEffect, useState } from "react";

type LifecycleAction = "archive" | "delete";

function currentConversationLeadId() {
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    try {
      const pathname = new URL(entries[index].name, window.location.origin).pathname;
      const match = pathname.match(/^\/api\/admin\/leads\/([^/]+)\/messages$/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    } catch {
      // Ignore malformed performance entries.
    }
  }
  return null;
}

function currentConversationPhone() {
  const selected = document.querySelector<HTMLElement>(".leadListItem.selected .leadListCopy em")?.textContent || "";
  const identity = document.querySelector<HTMLElement>(".conversationPanel .clientIdentity div > span")?.textContent || "";
  const raw = selected || identity;
  return raw.split("·")[0]?.trim() || "";
}

function currentConversationName() {
  return document.querySelector<HTMLElement>(".conversationPanel .clientIdentity strong")?.textContent?.trim()
    || document.querySelector<HTMLElement>(".leadListItem.selected .leadListCopy strong")?.textContent?.trim()
    || "this client";
}

function isLifecycleButton(button: HTMLButtonElement) {
  if (!button.closest(".conversationPanel .controlStrip")) return null;
  const label = button.textContent?.trim().toLowerCase();
  if (label === "archive chat") return "archive" as const;
  if (label === "delete chat") return "delete" as const;
  return null;
}

export function ChatLifecycleReliabilityEnhancer() {
  const [error, setError] = useState("");

  useEffect(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    let busy = false;

    const onClick = async (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const button = element?.closest<HTMLButtonElement>("button");
      if (!button) return;
      const action = isLifecycleButton(button);
      if (!action) return;

      // Stop the legacy phone-scraping handler. This handler uses the UUID from the
      // conversation request that actually loaded the open chat.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (busy) return;

      const leadId = currentConversationLeadId();
      const phone = currentConversationPhone();
      const name = currentConversationName();
      if (!leadId && !phone) {
        setError("Unable to identify the open client. Re-open the chat and try again.");
        return;
      }

      const question = action === "archive"
        ? `Archive the chat with ${name}? It will leave the active inbox and return automatically if the client messages again.`
        : `Permanently delete the chat with ${name}? This removes the client record and message history and cannot be undone.`;
      if (!window.confirm(question)) return;

      busy = true;
      button.disabled = true;
      setError("");
      try {
        const response = await fetch("/api/admin/leads/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, leadId: leadId || undefined, phone: phone || undefined })
        });
        const data = await response.json().catch(() => ({})) as { error?: string; deletedClients?: number };
        if (!response.ok) throw new Error(data.error || `Unable to ${action} this chat.`);
        if (action === "delete" && data.deletedClients === 0) throw new Error("The client record was not deleted. Please try again.");
        window.location.reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : `Unable to ${action} this chat.`);
        busy = false;
        button.disabled = false;
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!error) return null;
  return <div role="alert" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 2147483600, maxWidth: 420, padding: "12px 14px", borderRadius: 12, background: "#fff1f1", border: "1px solid #e7bcbc", color: "#8f2020", boxShadow: "0 12px 36px rgba(0,0,0,.18)", fontSize: 13 }}>{error}</div>;
}
