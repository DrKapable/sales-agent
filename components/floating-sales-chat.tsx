"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

type WidgetMessage = { id: string; role: "user" | "assistant"; content: string; time: string };

const welcome: WidgetMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hi 👋 Welcome to MedMinds. What can I help you with today?",
  time: "Now"
};

const suggestions = ["Pa Gym pricing", "Research proposal support", "Data analysis"] as const;

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function FloatingSalesChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<WidgetMessage[]>([welcome]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(() => `web-${crypto.randomUUID()}`);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("medmindsWidgetBody");
    document.documentElement.classList.add("medmindsWidgetHtml");
    return () => {
      document.body.classList.remove("medmindsWidgetBody");
      document.documentElement.classList.remove("medmindsWidgetHtml");
    };
  }, []);

  useEffect(() => {
    window.parent.postMessage({ type: "medminds-chat-resize", open }, "*");
  }, [open]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "medminds-chat-open") setOpen(true);
      if (event.data?.type === "medminds-chat-close") setOpen(false);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, open]);

  async function sendMessage(value: string) {
    const text = value.trim();
    if (!text || busy) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text, time: now() }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/public-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text })
      });
      const data = await response.json() as { reply?: string; error?: string };
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: "assistant",
        content: data.reply || data.error || "I could not answer that just now. Please try again.", time: now()
      }]);
    } catch {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: "I could not connect just now. Please try again in a moment.", time: now() }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  function newChat() {
    setMessages([welcome]);
    setInput("");
    setSessionId(`web-${crypto.randomUUID()}`);
  }

  if (!open) {
    return <button type="button" className="widgetLauncher" aria-label="Chat with MedMinds" onClick={() => setOpen(true)}>
      <span className="widgetLauncherLogo"><BrandLogo compact /></span><span className="widgetPulse" />
    </button>;
  }

  return <section className="salesChatWidget" aria-label="MedMinds chat assistant" aria-busy={busy}>
    <header className="widgetHeader">
      <span className="widgetBrand"><BrandLogo compact /></span>
      <div><strong>MedMinds Assistant</strong><small><span className="liveDot" /> Online</small></div>
      <button type="button" className="widgetNewChat" onClick={newChat} disabled={busy}>New</button>
      <button type="button" className="widgetClose" aria-label="Close chat" onClick={() => setOpen(false)}>×</button>
    </header>
    <div className="widgetMessages" aria-live="polite">
      {messages.map((message) => <div key={message.id} className={`widgetMessageRow ${message.role}`}>
        <div className="widgetMessage"><p>{message.content}</p><time>{message.time}</time></div>
      </div>)}
      {busy && <div className="widgetMessageRow assistant"><div className="widgetMessage widgetTyping" aria-label="MedMinds Assistant is typing"><span /><span /><span /></div></div>}
      <div ref={endRef} />
    </div>
    {messages.length === 1 && <div className="widgetSuggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void sendMessage(suggestion)} disabled={busy}>{suggestion}</button>)}</div>}
    <form className="widgetComposer" onSubmit={submit}>
      <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} maxLength={4000} rows={1} placeholder="Type a message" aria-label="Message MedMinds" disabled={busy} />
      <button type="submit" aria-label="Send message" disabled={busy || !input.trim()}>➤</button>
    </form>
    <div className="widgetFooter">MedMinds Learning Centre</div>
  </section>;
}
