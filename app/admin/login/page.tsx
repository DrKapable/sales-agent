"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (response.ok) { window.location.href = "/admin"; return; }
    const body = await response.json().catch(() => ({ error: "Unable to sign in." })) as { error: string };
    setError(body.error); setBusy(false);
  }

  return <main className="loginPage"><div className="loginCard">
    <Link href="/" className="brand"><span className="brandMark">M</span><span>MedMinds</span></Link>
    <span className="kicker">Admin access</span><h1>Sales dashboard</h1><p>Enter the configured administrator password.</p>
    <form onSubmit={submit}><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <div className="formError">{error}</div>}<button className="button buttonPrimary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form>
  </div></main>;
}

