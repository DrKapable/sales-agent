"use client";

import { useEffect } from "react";

function formatBubble(element: HTMLParagraphElement) {
  const raw = element.textContent || "";
  if (!raw.includes("*")) return;
  const normalized = raw.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
  const parts = normalized.split(/(\*[^*\n]+\*)/g);
  if (!parts.some((part) => /^\*[^*\n]+\*$/.test(part))) return;

  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    if (!part) continue;
    if (/^\*[^*\n]+\*$/.test(part)) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(1, -1);
      fragment.appendChild(strong);
    } else {
      fragment.appendChild(document.createTextNode(part));
    }
  }
  element.replaceChildren(fragment);
}

function scan(root: ParentNode = document) {
  root.querySelectorAll<HTMLParagraphElement>(".timelineBubble p").forEach(formatBubble);
}

export function ChatRichTextEnhancer() {
  useEffect(() => {
    scan();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(".timelineBubble p")) formatBubble(node as HTMLParagraphElement);
          scan(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
