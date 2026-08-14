"use client";

import { useEffect } from "react";

type DeliveryStatus = "accepted" | "sent" | "delivered" | "read" | "failed";

const MARKERS: Array<[DeliveryStatus, string]> = [
  ["accepted", "\u2063\u200B\u2063"],
  ["sent", "\u2063\u200C\u2063"],
  ["delivered", "\u2063\u200D\u2063"],
  ["read", "\u2063\u2060\u2063"],
  ["failed", "\u2063\uFEFF\u2063"]
];

const labelForStatus: Record<DeliveryStatus, string> = {
  accepted: "Accepted by WhatsApp",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Delivery failed"
};

function stripMarker(element: HTMLElement, marker: string) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes.reverse()) {
    if (!node.data.includes(marker)) continue;
    node.data = node.data.replaceAll(marker, "");
    return;
  }
}

function enhanceParagraph(paragraph: HTMLParagraphElement) {
  const raw = paragraph.textContent || "";
  const match = MARKERS.find(([, marker]) => raw.includes(marker));
  if (!match) return;
  const [status, marker] = match;
  stripMarker(paragraph, marker);

  const bubble = paragraph.closest<HTMLElement>(".timelineBubble");
  const time = bubble?.querySelector<HTMLTimeElement>("time");
  if (!time) return;

  time.querySelector(".messageDeliveryTicks")?.remove();
  const tick = document.createElement("span");
  tick.className = `messageDeliveryTicks ${status === "read" ? "isRead" : ""} ${status === "failed" ? "isFailed" : ""}`.trim();
  tick.textContent = status === "accepted" || status === "sent" ? "✓" : status === "failed" ? "!" : "✓✓";
  tick.title = labelForStatus[status];
  tick.setAttribute("aria-label", labelForStatus[status]);
  time.appendChild(tick);
}

function scan(root: ParentNode = document) {
  root.querySelectorAll<HTMLParagraphElement>(".timelineBubble p").forEach(enhanceParagraph);
}

export function ChatDeliveryTicksEnhancer() {
  useEffect(() => {
    scan();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target instanceof HTMLParagraphElement && mutation.target.matches(".timelineBubble p")) enhanceParagraph(mutation.target);
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(".timelineBubble p")) enhanceParagraph(node as HTMLParagraphElement);
          scan(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return <style>{`
    .timelineBubble time .messageDeliveryTicks{display:inline-block;margin-left:4px;font-size:12px;font-weight:800;line-height:1;color:#86948f;letter-spacing:-2px;vertical-align:-1px}
    .timelineBubble time .messageDeliveryTicks.isRead{color:#34b7f1}
    .timelineBubble time .messageDeliveryTicks.isFailed{color:#c44b4b;letter-spacing:0}
  `}</style>;
}
