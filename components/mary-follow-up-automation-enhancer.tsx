"use client";

import { useEffect } from "react";

function enhanceFollowUpWorkspace() {
  const shell = document.querySelector<HTMLElement>(".hfuShell");
  if (!shell) return;

  const header = shell.querySelector<HTMLElement>(".hfuHeader");
  const intro = header?.querySelector<HTMLParagraphElement>("p");
  if (intro && intro.dataset.maryAutomation !== "true") {
    intro.dataset.maryAutomation = "true";
    intro.textContent = "Mary-scheduled follow-ups are sent automatically through approved Meta templates. Human-scheduled follow-ups remain owned by the follow-up team.";
  }

  if (header && !shell.querySelector("[data-mary-followup-automation]")) {
    const banner = document.createElement("section");
    banner.dataset.maryFollowupAutomation = "true";
    banner.setAttribute("aria-label", "Mary automatic follow-up status");
    banner.style.cssText = "margin:12px 0 4px;padding:12px 14px;border:1px solid #b9ddd5;border-radius:13px;background:#eefaf7;display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;color:#164b43";
    banner.innerHTML = `<span style="width:10px;height:10px;border-radius:999px;background:#0f806f;margin-top:5px;box-shadow:0 0 0 4px rgba(15,128,111,.12)"></span><div style="min-width:0;flex:1"><strong style="display:block;font-size:13px">Mary automatic follow-ups active</strong><small style="display:block;margin-top:3px;line-height:1.45">Approved Meta templates are used for Mary-scheduled tasks when they become due. Sent template name and delivery status are recorded here. Converted and lost leads are excluded automatically.</small></div>`;
    header.insertAdjacentElement("afterend", banner);
  }

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
