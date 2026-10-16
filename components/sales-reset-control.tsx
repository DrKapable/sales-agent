"use client";
import { useState } from "react";

export function SalesResetControl() {
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reset() {
    if (phrase !== "RESET SALES DATA" || !password || busy) return;
    if (!window.confirm("Clear all active sales records, including verified payments, leads, chats, quotations and tasks? This does NOT refund money or cancel issued receipts. Audit copies will remain in the database.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/business/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: phrase, adminPassword: password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Reset failed");
      setPassword("");
      window.alert("Sales records reset. Recovery archive reference: " + result.resetId);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reset failed");
    } finally { setBusy(false); }
  }

  return <details style={{ maxWidth: 1440, margin: "8px auto", padding: "10px 14px", border: "1px solid #e4cccc", borderRadius: 12, background: "white", color: "#4c3232" }}>
    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 750 }}>Reset sales records</summary>
    <p style={{ fontSize: 12, lineHeight: 1.5 }}>Clear payments, leads, conversations, quotations, client documents and follow-ups while retaining the service catalogue, integrations and a recovery archive. New messages may create fresh records after the reset.</p>
    <p style={{ fontSize: 12 }}><strong>Financial transactions and issued receipts are not reversed.</strong></p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
      <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Type RESET SALES DATA<input value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }} /></label>
      <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Administrator password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }} /></label>
      <button type="button" disabled={busy || phrase !== "RESET SALES DATA" || !password} onClick={() => void reset()} style={{ padding: "10px 14px", background: "#a32929", color: "white", borderRadius: 8, border: 0, cursor: "pointer" }}>{busy ? "Resetting…" : "Clear sales records"}</button>
    </div>
    {error && <p role="alert" style={{ color: "#a32929", fontSize: 12 }}>{error}</p>}
  </details>;
}
