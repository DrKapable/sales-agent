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
  target.dataset.briefSource = source;

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

function analyticsDays() {
  const label = document.querySelector<HTMLElement>(".biaRange button.active")?.textContent?.trim().toLowerCase() || "90 days";
  if (label.includes("year")) return 365;
  const value = Number(label.match(/\d+/)?.[0] || 90);
  return Number.isFinite(value) ? value : 90;
}

async function downloadManagementBrief(format: "pdf" | "word", body: HTMLElement, button: HTMLButtonElement) {
  const analysis = body.dataset.briefSource || body.textContent?.trim() || "";
  if (!analysis) return;
  const original = button.textContent || "Download";
  button.disabled = true;
  button.textContent = "Preparing…";
  try {
    const response = await fetch("/api/admin/business/analytics/brief-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, analysis, generatedAt: new Date().toISOString(), days: analyticsDays() })
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json.error || "Unable to export the management brief.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const name = disposition.match(/filename="([^"]+)"/)?.[1] || `MedMinds-Management-Brief.${format === "pdf" ? "pdf" : "doc"}`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Unable to export the management brief.");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function addBriefDownloads(analysis: HTMLElement) {
  const head = analysis.querySelector<HTMLElement>(".biaAnalysisHead");
  if (!head || head.querySelector(".biaBriefDownloads")) return;
  const body = Array.from(analysis.children).find((child) => !child.classList.contains("biaAnalysisHead")) as HTMLElement | undefined;
  if (!body) return;
  const actions = document.createElement("span");
  actions.className = "biaBriefDownloads";
  const word = document.createElement("button");
  word.type = "button";
  word.textContent = "↓ Word";
  word.setAttribute("aria-label", "Download management brief in Word format");
  word.addEventListener("click", () => void downloadManagementBrief("word", body, word));
  const pdf = document.createElement("button");
  pdf.type = "button";
  pdf.textContent = "↓ PDF";
  pdf.setAttribute("aria-label", "Download management brief as PDF");
  pdf.addEventListener("click", () => void downloadManagementBrief("pdf", body, pdf));
  actions.append(word, pdf);
  head.appendChild(actions);
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
  addBriefDownloads(analysis);
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
    .biaAnalysisHead{padding:12px 15px!important;margin:0!important;background:#f7fbfa;border-bottom:1px solid #e2ece9;display:flex!important;align-items:center!important;gap:9px;flex-wrap:wrap}
    .biaAnalysisHead>span:not(.biaBriefDownloads){margin-right:auto}.biaBriefDownloads{margin-left:auto;display:inline-flex;gap:6px;align-items:center}.biaBriefDownloads button{min-height:34px;border:1px solid #cfe0dc;background:#fff;color:#24544f;border-radius:9px;padding:0 10px;font-size:10.5px;font-weight:850;cursor:pointer}.biaBriefDownloads button:hover{background:#edf7f4}.biaBriefDownloads button:disabled{opacity:.55;cursor:wait}.biaBriefDownloads button:focus-visible{outline:3px solid rgba(8,125,120,.22);outline-offset:2px}
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
      .biaAnalysisHead{padding:11px 13px!important;align-items:flex-start!important}.biaAnalysisHead>strong{min-width:0}.biaAnalysisHead>span:not(.biaBriefDownloads){font-size:10px}.biaBriefDownloads{width:100%;margin-left:0}.biaBriefDownloads button{flex:1;min-height:40px}
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
