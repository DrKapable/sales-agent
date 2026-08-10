"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; time: string };

const starterPrompts = [
  "I need research support",
  "Tell me about PA Gym",
  "I need a quotation"
] as const;

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hi 👋 Welcome to MedMinds. What would you like help with today?",
  time: "Now"
};

function currentTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TestChat({ enabled }: { enabled: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(() => `sim-${crypto.randomUUID()}`);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function sendMessage(value: string) {
    const text = value.trim();
    if (!text || busy || !enabled) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text, time: currentTime() }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text })
      });
      const data = await response.json() as { reply?: string; error?: string };
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || data.error || "The assistant is temporarily unavailable.",
        time: currentTime()
      }]);
    } catch {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "The assistant is temporarily unavailable. Please try again.",
        time: currentTime()
      }]);
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

  function resetChat() {
    setMessages([welcomeMessage]);
    setInput("");
    setSessionId(`sim-${crypto.randomUUID()}`);
  }

  return (
    <div className="chatPanel" aria-busy={busy}>
      <div className="chatTop">
        <span className="avatar logoAvatar"><BrandLogo compact /></span>
        <div><strong>MedMinds Assistant</strong><small><span className="liveDot" />{enabled ? "Online and ready to help" : "Configuration pending"}</small></div>
        <button className="newChatButton" type="button" onClick={resetChat} disabled={busy}>New chat</button>
      </div>
      <div className="chatPrivacy">Secure sales assistant · One question at a time</div>
      <div className="chatMessages" aria-live="polite">
        {messages.map((message) => <div key={message.id} className={`chatMessageRow ${message.role}`}>
          <div className={`message ${message.role === "user" ? "out" : "in"}`}>
            <p>{message.content}</p><time>{message.time}</time>
          </div>
        </div>)}
        {busy && <div className="chatMessageRow assistant"><div className="message in typing" aria-label="MedMinds Assistant is typing"><span /><span /><span /></div></div>}
        <div ref={endRef} />
      </div>
      {messages.length === 1 && <div className="starterPrompts" aria-label="Suggested questions">
        {starterPrompts.map((prompt) => <button key={prompt} type="button" disabled={!enabled || busy} onClick={() => void sendMessage(prompt)}>{prompt}</button>)}
      </div>}
      <form className="chatForm" onSubmit={submit}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} rows={1} maxLength={4000} placeholder={enabled ? "Write your message" : "Configure AI Gateway to begin"} disabled={!enabled || busy} aria-label="Test message" />
        <button type="submit" disabled={!enabled || busy || !input.trim()} aria-label="Send message"><span>Send</span><b aria-hidden="true">➤</b></button>
      </form>
      <div className="composerHint">Enter to send · Shift + Enter for a new line</div>
    </div>
  );
}
