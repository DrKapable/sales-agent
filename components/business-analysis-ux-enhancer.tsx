"use client";

import { useEffect } from "react";

function setText(node: Element | null, value: string) {
  if (!node || node.textContent === value) return;
  node.textContent = value;
}

function appendInline(parent: HTMLElement, text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
    } else {
      parent.appendChild(document.createTextNode(part.replace(/\*\*/g, "")));
    }
  }
}

function renderManagementBrief(target: HTMLElement) {
  if (target.querySelector(":scope > .biaBriefRich")) return;
  const source = target.textContent?.trim();
  if (!source) return;

  const wrapper = document.createElement("div");
  wrapper.className = "biaBriefRich";
  const lines = source.split(/\r?\n/);
  let list: HTMLUListElement | HTMLOListElement | null = null;
  let listKind: "ul" | "ol" | null = null;

  const closeList = () => {
    if (list) wrapper.appendChild(list);
    list = null;
    listKind = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      closeList();
      const h = document.createElement("h3");
      appendInline(h, heading[1]);
      wrapper.appendChild(h);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      const kind = numbered ? "ol" : "ul";
      if (!list || listKind !== kind) {
        closeList();
        list = document.createElement(kind);
        listKind = kind;
      }
      const li = document.createElement("li");
      appendInline(li, (bullet || numbered)![1]);
      list.appendChild(li);
      continue;
    }

    closeList();
    const p = document.createElement("p");
    appendInline(p, line);
    wrapper.appendChild(p);
  }
  closeList();
  target.replaceChildren(wrapper);
}

function enhanceAnalysisSection() {
  if (!window.location.pathname.startsWith("/admin/business")) return;
  const section = document.querySelector<HTMLElement>(".biaAi");
  if (!section) return;

  const description = section.querySelector(".biaAiIntro p");
  setText(description, "The agent analyses charts, pipeline data, inbox messages and conversation gaps together before making recommendations.");

  const primary = section.querySelector<HTMLButtonElement>(".biaAiIntro > button");
  if (primary) {
    const busy = primary.disabled || /analysing/i.test(primary.textContent || "");
    setText(primary, busy ? "Analysing charts + messages…" : "Analyse charts + messages");
    primary.setAttribute("aria-label", "Analyse charts and inbox messages");
  }

  const askInput = section.querySelector<HTMLInputElement>(".biaAskRow input");
  if (askInput && askInput.placeholder !== "Optional: ask about charts, clients, messages, objections or conversion gaps") {
    askInput.placeholder = "Optional: ask about charts, clients, messages, objections or conversion gaps";
  }

  const empty = section.querySelector<HTMLElement>(".biaAiEmpty");
  setText(empty, "Run the analysis to generate a grounded management brief from charts, pipeline data, recent inbox messages and gap signals.");

  const intro = section.querySelector<HTMLElement>(".biaAiIntro");
  if (intro && !section.querySelector(".biaAiSourceStrip")) {
    const strip = document.createElement("div");
    strip.className = "biaAiSourceStrip";
    strip.setAttribute("aria-label", "Data included in analysis");
    ["Charts & trends", "Inbox messages", "Pipeline", "Conversion gaps"].forEach((label) => {
      const chip = document.createElement("span");
      chip.textContent = label;
      strip.appendChild(chip);
    });
    intro.insertAdjacentElement("afterend", strip);
  }

  const analysis = section.querySelector<HTMLElement>(".biaAnalysis");
  if (!analysis) return;
  const directChildren = Array.from(analysis.children) as HTMLElement[];
  const body = directChildren.find((child) => !child.classList.contains("biaAnalysisHead"));
  if (body) renderManagementBrief(body);
}

export function BusinessAnalysisUXEnhancer() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        enhanceAnalysisSection();
      });
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <style jsx global>{`
    .biaAiSourceStrip{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #deebe7}
    .biaAiSourceStrip span{display:inline-flex;align-items:center;min-height:30px;padding:5px 9px;border-radius:999px;background:#edf7f4;color:#42665e;font-size:10.5px;font-weight:800}
    .biaAnalysis{white-space:normal!important;padding:0!important;overflow:hidden}
    .biaAnalysisHead{padding:14px 15px 11px;margin:0!important;background:#f7fbfa;border-bottom:1px solid #e2ece9;align-items:center}
    .biaBriefRich{padding:6px 15px 16px;display:grid;gap:0}
    .biaBriefRich h3{margin:16px 0 7px;font-size:14px;line-height:1.3;color:#123f4d;letter-spacing:-.01em}
    .biaBriefRich h3:first-child{margin-top:8px}
    .biaBriefRich p{margin:5px 0;color:#405b54;font-size:12.8px;line-height:1.6}
    .biaBriefRich ul,.biaBriefRich ol{margin:3px 0 7px;padding-left:21px;display:grid;gap:7px}
    .biaBriefRich li{color:#29484f;font-size:12.8px;line-height:1.55;padding-left:2px}
    .biaBriefRich strong{color:#12313b;font-weight:850}
    .biaBriefRich h3:not(:first-child){padding-top:12px;border-top:1px solid #edf2f0}
    @media(max-width:720px){
      .biaAiSourceStrip{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      .biaAiSourceStrip span{justify-content:center;text-align:center;min-width:0}
      .biaAnalysisHead{padding:12px 13px 10px}
      .biaBriefRich{padding:5px 13px 15px}
      .biaBriefRich h3{font-size:13.5px}
      .biaBriefRich p,.biaBriefRich li{font-size:12.5px;line-height:1.58}
    }
    @media(max-width:390px){
      .biaAiSourceStrip{grid-template-columns:1fr}
      .biaBriefRich{padding-inline:12px}
    }
  `}</style>;
}
