"use client";

import { useEffect, useState } from "react";

type Component = { type: string; text?: string };
type Template = { id: string; name: string; language: string; category?: string; components: Component[] };

function countVars(text = "") {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function currentPhone() {
  const text = document.querySelector<HTMLElement>(".conversationHeader .clientIdentity div > span")?.textContent || "";
  return text.split("·")[0]?.trim().replace(/\D/g, "") || "";
}

function currentSender() {
  return (document.querySelector<HTMLSelectElement>(".replyComposer .composerTop select")?.value || "Administrator").trim();
}

export function MetaTemplateEnhancer() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "loading" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    setState("loading");
    fetch("/api/admin/meta-templates", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load templates.");
        setTemplates(data.templates || []);
        setSelected(data.templates?.[0] ? `${data.templates[0].name}|${data.templates[0].language}` : "");
        setState("idle");
      })
      .catch((error) => { setMessage(error instanceof Error ? error.message : "Unable to load templates."); setState("error"); });
  }, []);

  const template = templates.find((item) => `${item.name}|${item.language}` === selected) || null;
  const header = template?.components.find((item) => item.type === "HEADER");
  const body = template?.components.find((item) => item.type === "BODY");
  const headerVars = countVars(header?.text);
  const bodyVars = countVars(body?.text);

  async function send() {
    if (!template) return;
    const phone = currentPhone();
    if (!phone) { setMessage("Select a client conversation first."); setState("error"); return; }
    const missing = [...Array(headerVars)].some((_, i) => !values[`h${i + 1}`]?.trim()) || [...Array(bodyVars)].some((_, i) => !values[`b${i + 1}`]?.trim());
    if (missing) { setMessage("Complete all template variables before sending."); setState("error"); return; }
    const components = [] as Array<{ type: "header" | "body"; parameters: Array<{ type: "text"; text: string }> }>;
    if (headerVars) components.push({ type: "header", parameters: [...Array(headerVars)].map((_, i) => ({ type: "text", text: values[`h${i + 1}`].trim() })) });
    if (bodyVars) components.push({ type: "body", parameters: [...Array(bodyVars)].map((_, i) => ({ type: "text", text: values[`b${i + 1}`].trim() })) });
    setState("sending"); setMessage("");
    try {
      const response = await fetch("/api/admin/meta-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, name: template.name, language: template.language, sender: currentSender(), components }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Meta did not accept the template.");
      setState("sent"); setMessage(`Template “${template.name}” accepted by Meta.`);
      window.setTimeout(() => setState("idle"), 3000);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Unable to send template."); }
  }

  if (!templates.length && state !== "error") return null;
  return <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 1000, width: "min(390px, calc(100vw - 28px))", background: "var(--surface, #fff)", border: "1px solid rgba(15,23,42,.14)", borderRadius: 16, boxShadow: "0 18px 50px rgba(15,23,42,.18)", padding: 14 }}>
    <details open={state === "error" ? true : undefined}>
      <summary style={{ cursor: "pointer", fontWeight: 800, display: "flex", justifyContent: "space-between", gap: 12 }}><span>Meta templates</span><small style={{ fontWeight: 600, opacity: .65 }}>{templates.length ? `${templates.length} approved` : "Setup needed"}</small></summary>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {templates.length > 0 && <select aria-label="Approved Meta template" value={selected} onChange={(event) => { setSelected(event.target.value); setValues({}); setMessage(""); setState("idle"); }} style={{ width: "100%", minHeight: 42, borderRadius: 10, padding: "8px 10px" }}>{templates.map((item) => <option key={`${item.id}-${item.language}`} value={`${item.name}|${item.language}`}>{item.name} · {item.language}</option>)}</select>}
        {template && <div style={{ fontSize: 13, lineHeight: 1.45, padding: 10, borderRadius: 10, background: "rgba(15,23,42,.045)", maxHeight: 150, overflow: "auto" }}>{header?.text && <strong style={{ display: "block", marginBottom: 5 }}>{header.text}</strong>}<span>{body?.text || "Approved WhatsApp template"}</span></div>}
        {[...Array(headerVars)].map((_, i) => <input key={`h${i}`} placeholder={`Header variable {{${i + 1}}}`} value={values[`h${i + 1}`] || ""} onChange={(e) => setValues((v) => ({ ...v, [`h${i + 1}`]: e.target.value }))} style={{ minHeight: 40, borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(15,23,42,.18)" }} />)}
        {[...Array(bodyVars)].map((_, i) => <input key={`b${i}`} placeholder={`Message variable {{${i + 1}}}`} value={values[`b${i + 1}`] || ""} onChange={(e) => setValues((v) => ({ ...v, [`b${i + 1}`]: e.target.value }))} style={{ minHeight: 40, borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(15,23,42,.18)" }} />)}
        {message && <small style={{ lineHeight: 1.4 }}>{message}</small>}
        {templates.length > 0 && <button type="button" onClick={() => void send()} disabled={state === "sending"} style={{ minHeight: 44, border: 0, borderRadius: 11, fontWeight: 800, cursor: "pointer", background: "#0f806f", color: "white" }}>{state === "sending" ? "Sending..." : state === "sent" ? "Sent" : "Send approved template"}</button>}
      </div>
    </details>
  </div>;
}
