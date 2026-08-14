"use client";

import { useEffect } from "react";

const WELCOME = "Hi 👋 I'm Mary Kainda from MedMinds. What can I help you with today?";

function applyIdentity(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".timelineBubble > span").forEach((label) => {
    if (label.textContent?.trim() === "MedMinds AI") label.textContent = "Mary Kainda";
  });

  root.querySelectorAll<HTMLElement>(".widgetHeader strong").forEach((label) => {
    if (label.textContent?.trim() === "MedMinds Assistant") label.textContent = "Mary Kainda";
  });

  root.querySelectorAll<HTMLElement>(".widgetHeader small").forEach((label) => {
    if (label.textContent?.includes("Online")) label.innerHTML = '<span class="liveDot"></span> MedMinds AI · Online';
  });

  root.querySelectorAll<HTMLElement>(".widgetMessageRow.assistant .widgetMessage p").forEach((message, index) => {
    if (index === 0 && message.textContent?.trim() === "Hi 👋 Welcome to MedMinds. What can I help you with today?") {
      message.textContent = WELCOME;
    }
  });

  root.querySelectorAll<HTMLElement>(".widgetTyping").forEach((typing) => typing.setAttribute("aria-label", "Mary Kainda is typing"));
  root.querySelectorAll<HTMLElement>(".salesChatWidget").forEach((chat) => chat.setAttribute("aria-label", "Mary Kainda, MedMinds AI assistant"));
  root.querySelectorAll<HTMLElement>(".widgetLauncher").forEach((launcher) => launcher.setAttribute("aria-label", "Chat with Mary Kainda"));
  root.querySelectorAll<HTMLTextAreaElement>(".widgetComposer textarea").forEach((input) => input.setAttribute("aria-label", "Message Mary Kainda"));
}

export function AgentIdentityEnhancer() {
  useEffect(() => {
    applyIdentity();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) applyIdentity(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
