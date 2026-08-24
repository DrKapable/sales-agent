"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Component = { type: string; text?: string };
type Template = { id: string; name: string; language: string; category?: string; components: Component[] };
type Inventory = { templates: Template[]; approvedCount?: number; sampleCount?: number; sampleOnly?: boolean; wabaSuffix?: string };

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
  const [open, setOpen] = useState(false);
  const [actionHost, setActionHost] = useState<HTMLElement | null>(null);
  const [inventory, setInventory] = useState<Inventory>({ templates: [] });

  useEffect(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    const findHost = () => setActionHost(document.querySelector<HTMLElement>(".conversationActions"));
    findHost();
    const observer = new MutationObserver(findHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    setState("loading");
    fetch("/api/admin/meta-templates", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as Inventory & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load templates.");
        setInventory(data);
        setTemplates(data.templates || []);
        setSelected(data.templates?.[0] ? `${data.templates[0].name}|${data.templates[0].language}` : "");
        if (data.sampleOnly) {
          setMessage(`Only Meta sample templates were found for WABA …${data.wabaSuffix || ""}. Please replace WHATSAPP_BUSINESS_ACCOUNT_ID with the production WABA that contains your approved templates.`);
        } else {
          setMessage("");
        }
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
      window.setTimeout(() => { setState("idle"); setOpen(false); }, 1800);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Unable to send template."); }
  }

  if (!actionHost) return null;

  const trigger = createPortal(
    <button
      type="button"
      aria-label="Open approved Meta templates"
      title="Meta templates"
      onClick={() => setOpen(true)}
      style={{ minWidth: 38, height: 38, padding: "0 10px", borderRadius: 19, border: "1px solid rgba(255,255,255,.24)", background: "rgba(255,255,255,.10)", color: "inherit", fontWeight: 800, cursor: "pointer", fontSize: 12 }}
    >Templates</button>,
    actionHost
  );

  const modal = open ? createPortal(
    <div role="dialog" aria-modal="true" aria-label="Approved Meta templates" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 5000, display: "grid", placeItems: "end center", background: "rgba(3,12,18,.42)", padding: "16px 12px calc(16px + env(safe-area-inset-bottom))" }}>
      <section style={{ width: "min(520px, 100%)", maxHeight: "min(78dvh, 720px)", overflow: "auto", background: "#fff", color: "#18334d", borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,.30)", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div><strong style={{ display: "block", fontSize: 18 }}>Meta templates</strong><small style={{ opacity: .7 }}>{templates.length} production approved{inventory.sampleCount ? ` · ${inventory.sampleCount} Meta samples hidden` : ""}</small></div>
          <button type="button" aria-label="Close templates" onClick={() => setOpen(false)} style={{ width: 38, height: 38, borderRadius: 19, border: "1px solid rgba(15,23,42,.12)", background: "#f4f7f6", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {inventory.sampleOnly && <div style={{ padding: 12, borderRadius: 12, background: "#fff4df", border: "1px solid #efd49b", fontSize: 13, lineHeight: 1.45 }}><strong style={{ display: "block", marginBottom: 4 }}>Production WABA not connected</strong>Only Meta sample templates were returned for WABA …{inventory.wabaSuffix}. Update <code>WHATSAPP_BUSINESS_ACCOUNT_ID</code> to the WABA that contains your real approved templates, then redeploy.</div>}
          {!inventory.sampleOnly && templates.length === 0 && state !== "error" && <div style={{ padding: 12, borderRadius: 12, background: "#f4f7f6", fontSize: 13 }}>No production approved templates were returned by Meta.</div>}
          {templates.length > 0 && <select aria-label="Approved Meta template" value={selected} onChange={(event) => { setSelected(event.target.value); setValues({}); setMessage(""); setState("idle"); }} style={{ width: "100%", minHeight: 46, borderRadius: 11, padding: "8px 10px", border: "1px solid rgba(15,23,42,.18)", background: "#fff", fontSize: 14 }}>{templates.map((item) => <option key={`${item.id}-${item.language}`} value={`${item.name}|${item.language}`}>{item.name} · {item.language}</option>)}</select>}
          {template && <div style={{ fontSize: 13, lineHeight: 1.5, padding: 12, borderRadius: 11, background: "#f4f7f6", maxHeight: 190, overflow: "auto" }}>{header?.text && <strong style={{ display: "block", marginBottom: 5 }}>{header.text}</strong>}<span>{body?.text || "Approved WhatsApp template"}</span></div>}
          {[...Array(headerVars)].map((_, i) => <input key={`h${i}`} placeholder={`Header variable {{${i + 1}}}`} value={values[`h${i + 1}`] || ""} onChange={(e) => setValues((v) => ({ ...v, [`h${i + 1}`]: e.target.value }))} style={{ minHeight: 44, borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(15,23,42,.18)" }} />)}
          {[...Array(bodyVars)].map((_, i) => <input key={`b${i}`} placeholder={`Message variable {{${i + 1}}}`} value={values[`b${i + 1}`] || ""} onChange={(e) => setValues((v) => ({ ...v, [`b${i + 1}`]: e.target.value }))} style={{ minHeight: 44, borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(15,23,42,.18)" }} />)}
          {message && <small style={{ lineHeight: 1.45, color: state === "error" ? "#9b2c2c" : "inherit" }}>{message}</small>}
          {templates.length > 0 && <button type="button" onClick={() => void send()} disabled={state === "sending"} style={{ minHeight: 48, border: 0, borderRadius: 12, fontWeight: 800, cursor: "pointer", background: "#0f806f", color: "white", fontSize: 15 }}>{state === "sending" ? "Sending..." : state === "sent" ? "Sent" : "Send approved template"}</button>}
        </div>
      </section>
    </div>,
    document.body
  ) : null;

  return <>{trigger}{modal}</>;
}
