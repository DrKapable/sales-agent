"use client";

import { FormEvent, useMemo, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function TestChat({ enabled }: { enabled: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: "Hi 👋 Welcome to MedMinds. What would you like help with today?" }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionId = useMemo(() => `sim-${crypto.randomUUID()}`, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || !enabled) return;
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/test-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, message: text }) });
      const data = await response.json() as { reply?: string; error?: string };
      setMessages((current) => [...current, { role: "assistant", content: data.reply || data.error || "The assistant is temporarily unavailable." }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "The assistant is temporarily unavailable. Please try again." }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="chatPanel">
      <div className="chatTop"><span className="avatar">MM</span><div><strong>MedMinds Assistant</strong><small>{enabled ? "Online" : "Configuration pending"}</small></div></div>
      <div className="chatMessages" aria-live="polite">
        {messages.map((message, index) => <div key={index} className={`message ${message.role === "user" ? "out" : "in"}`}>{message.content}</div>)}
        {busy && <div className="message in typing">Thinking…</div>}
      </div>
      <form className="chatForm" onSubmit={submit}>
        <input value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder={enabled ? "Type a client enquiry…" : "Configure AI Gateway to begin"} disabled={!enabled || busy} aria-label="Test message" />
        <button type="submit" disabled={!enabled || busy || !input.trim()} aria-label="Send message">Send</button>
      </form>
    </div>
  );
}

