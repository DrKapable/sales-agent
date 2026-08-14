"use client";

import { useEffect } from "react";

function applyMaryLabel(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".timelineBubble > span").forEach((label) => {
    if (label.textContent?.trim() === "MedMinds AI") label.textContent = "Mary Kainda";
  });
}

export function AgentIdentityEnhancer() {
  useEffect(() => {
    applyMaryLabel();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(".timelineBubble > span") && node.textContent?.trim() === "MedMinds AI") {
            node.textContent = "Mary Kainda";
          }
          applyMaryLabel(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
