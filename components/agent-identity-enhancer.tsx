"use client";

import { useEffect } from "react";

const AGENT_NAME = "Mary Kaunda";
const WELCOME = `Hi 👋 I'm ${AGENT_NAME} from MedMinds. What can I help you with today?`;

function replaceOldName(element: HTMLElement) {
  const text = element.textContent || "";
  if (text.includes("Mary Kainda")) element.textContent = text.replaceAll("Mary Kainda", AGENT_NAME);
}

function applyIdentity(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".timelineBubble > span").forEach((label) => {
    if (label.textContent?.trim() === "MedMinds AI" || label.textContent?.trim() === "Mary Kainda") label.textContent = AGENT_NAME;
  });

  root.querySelectorAll<HTMLElement>(".widgetHeader strong, .chatTop strong").forEach((label) => {
    if (["MedMinds Assistant", "Mary Kainda"].includes(label.textContent?.trim() || "")) label.textContent = AGENT_NAME;
  });

  root.querySelectorAll<HTMLElement>(".widgetHeader small").forEach((label) => {
    if (label.textContent?.includes("Online")) label.innerHTML = '<span class="liveDot"></span> MedMinds AI · Online';
  });

  root.querySelectorAll<HTMLElement>(".widgetMessageRow.assistant .widgetMessage p, .chatMessageRow.assistant .message p").forEach((message, index) => {
    const text = message.textContent?.trim() || "";
    if (index === 0 && (text === "Hi 👋 Welcome to MedMinds. What can I help you with today?" || text.includes("Mary Kainda"))) {
      message.textContent = text.includes("Mary Kainda") ? text.replaceAll("Mary Kainda", AGENT_NAME) : WELCOME;
    }
  });

  root.querySelectorAll<HTMLElement>(".widgetTyping, .typing").forEach((typing) => typing.setAttribute("aria-label", `${AGENT_NAME} is typing`));
  root.querySelectorAll<HTMLElement>(".salesChatWidget").forEach((chat) => chat.setAttribute("aria-label", `${AGENT_NAME}, MedMinds AI assistant`));
  root.querySelectorAll<HTMLElement>(".widgetLauncher").forEach((launcher) => launcher.setAttribute("aria-label", `Chat with ${AGENT_NAME}`));
  root.querySelectorAll<HTMLTextAreaElement>(".widgetComposer textarea").forEach((input) => input.setAttribute("aria-label", `Message ${AGENT_NAME}`));

  root.querySelectorAll<HTMLElement>("[aria-label*='Mary Kainda'], [title*='Mary Kainda']").forEach((element) => {
    const aria = element.getAttribute("aria-label");
    const title = element.getAttribute("title");
    if (aria) element.setAttribute("aria-label", aria.replaceAll("Mary Kainda", AGENT_NAME));
    if (title) element.setAttribute("title", title.replaceAll("Mary Kainda", AGENT_NAME));
  });

  root.querySelectorAll<HTMLElement>(".widgetHeader strong, .chatTop strong, .timelineBubble > span").forEach(replaceOldName);
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
