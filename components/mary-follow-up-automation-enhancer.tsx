"use client";

import { useEffect } from "react";

function enhanceFollowUpWorkspace() {
  const shell = document.querySelector<HTMLElement>(".hfuShell");
  if (!shell) return;

  shell.querySelectorAll<HTMLElement>(".hfuReason strong").forEach((label) => {
    if (label.textContent?.trim() === "Mary scheduled") label.textContent = "Mary scheduled · Auto Meta";
  });

  shell.querySelectorAll<HTMLElement>(".hfuHistory small").forEach((item) => {
    if (item.textContent?.startsWith("SMS: ")) item.textContent = item.textContent.replace(/^SMS:/, "Delivery:");
  });

  shell.querySelectorAll<HTMLElement>(".hfuMetrics button small").forEach((item) => {
    if (item.textContent?.trim() === "needs human action") item.textContent = "auto or human action";
  });
}

export function MaryFollowUpAutomationEnhancer() {
  useEffect(() => {
    enhanceFollowUpWorkspace();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        enhanceFollowUpWorkspace();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
