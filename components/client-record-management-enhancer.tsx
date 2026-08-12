"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function ClientRecordManagementEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = () => {
      const toolbar = document.querySelector<HTMLElement>(".dashboard .leadToolbar");
      setTarget((current) => current === toolbar ? current : toolbar);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function deleteAllClients() {
    if (busy) return;
    const confirmation = window.prompt(
      "This permanently deletes every client record, conversation and linked client business record. Type DELETE ALL CLIENTS to continue."
    );
    if (confirmation !== "DELETE ALL CLIENTS") return;

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/leads/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_all", confirmation })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete client records.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete client records.");
      setBusy(false);
    }
  }

  if (!target) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="button buttonGhost"
        disabled={busy}
        style={{ color: "#a62a2a", borderColor: "#e7bcbc" }}
        onClick={() => void deleteAllClients()}
      >
        {busy ? "Deleting..." : "Delete all clients"}
      </button>
      {error ? <span style={{ color: "#a62a2a", fontSize: 12 }}>{error}</span> : null}
    </>,
    target
  );
}
