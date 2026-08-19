"use client";

import { useEffect, useRef } from "react";
import { BusinessIntelligence } from "@/components/business-intelligence";

function setSelectValue(select: HTMLSelectElement | undefined, value: string) {
  if (!select) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function BusinessIntelligenceResponsive() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const openView = (label: string, filters?: { band?: string; status?: string }) => {
      const navButtons = Array.from(root.querySelectorAll("nav button")) as HTMLButtonElement[];
      const target = navButtons.find((button) => button.textContent?.toLowerCase().includes(label.toLowerCase()));
      target?.click();
      if (!filters) return;
      window.setTimeout(() => {
        const selects = Array.from(root.querySelectorAll("select")) as HTMLSelectElement[];
        if (filters.band) setSelectValue(selects[0], filters.band);
        if (filters.status) setSelectValue(selects[1], filters.status);
      }, 90);
    };

    const makeMetricInteractive = (article: HTMLElement) => {
      if (article.dataset.biMetricReady === "1") return;
      const text = article.textContent || "";
      let handler: (() => void) | null = null;
      if (text.includes("Total leads")) handler = () => openView("Leads", { band: "ALL", status: "ALL" });
      else if (text.includes("Conversion")) handler = () => openView("Leads", { band: "ALL", status: "CONVERTED" });
      else if (text.includes("Hot leads")) handler = () => openView("Leads", { band: "HOT", status: "ALL" });
      else if (text.includes("Follow-ups due")) handler = () => openView("Leads", { band: "ALL", status: "FOLLOW-UP REQUIRED" });
      else if (text.includes("Pending payments")) handler = () => openView("Operations");
      else if (text.includes("Open tasks")) handler = () => openView("Operations");
      if (!handler) return;

      article.dataset.biMetricReady = "1";
      article.setAttribute("role", "button");
      article.setAttribute("tabindex", "0");
      article.setAttribute("aria-label", `Open ${text.trim()}`);
      article.addEventListener("click", handler);
      article.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handler?.();
        }
      });
    };

    const enhance = () => {
      const main = root.querySelector("main") as HTMLElement | null;
      if (!main) return;
      main.classList.add("biResponsiveMain");

      const inner = main.firstElementChild as HTMLElement | null;
      if (!inner) return;
      inner.classList.add("biResponsiveContainer");

      const header = inner.querySelector(":scope > header") as HTMLElement | null;
      header?.classList.add("biResponsiveHeader");

      const nav = inner.querySelector(":scope > nav") as HTMLElement | null;
      if (nav) {
        nav.classList.add("biResponsiveTabs");
        Array.from(nav.children).forEach((item) => item.classList.add("biResponsiveTab"));
      }

      const directSections = Array.from(inner.querySelectorAll(":scope > section")) as HTMLElement[];
      directSections.forEach((section) => section.classList.add("biResponsiveSection"));

      const metricSection = directSections.find((section) => section.textContent?.includes("Total leads") && section.textContent?.includes("Conversion"));
      if (metricSection) {
        metricSection.classList.add("biResponsiveMetrics");
        Array.from(metricSection.querySelectorAll(":scope > article")).forEach((article) => {
          const element = article as HTMLElement;
          element.classList.add("biResponsiveMetricCard");
          makeMetricInteractive(element);
        });
      }

      const searchInput = root.querySelector('input[placeholder^="Search name"]') as HTMLInputElement | null;
      if (searchInput) {
        const toolbar = searchInput.closest("div[style]")?.parentElement as HTMLElement | null;
        toolbar?.classList.add("biResponsiveToolbar");
        searchInput.classList.add("biResponsiveSearch");
        Array.from(toolbar?.querySelectorAll("select") || []).forEach((select) => select.classList.add("biResponsiveSelect"));
      }

      const articles = Array.from(inner.querySelectorAll("article")) as HTMLElement[];
      articles.forEach((article) => {
        article.classList.add("biResponsiveCard");
        const text = article.textContent || "";
        if (text.includes("+ Task") && text.includes("Quote") && text.includes("Payment")) {
          article.classList.add("biResponsiveLeadCard");
          const children = Array.from(article.children) as HTMLElement[];
          children[0]?.classList.add("biResponsiveLeadContent");
          children[1]?.classList.add("biResponsiveLeadActions");
        }
      });

      const allDivs = Array.from(root.querySelectorAll("div")) as HTMLElement[];
      allDivs.forEach((element) => {
        const style = element.style;
        if (style.position === "fixed" && style.zIndex === "9999") {
          element.classList.add("biResponsiveModalBackdrop");
          (element.firstElementChild as HTMLElement | null)?.classList.add("biResponsiveModalCard");
        }

        const text = element.textContent || "";
        if ((text.includes("Complete") || text.includes("Verify")) && element.children.length >= 2 && style.display === "flex") {
          element.classList.add("biResponsiveOperationRow");
        }
      });

      Array.from(root.querySelectorAll("button,a,input,select,textarea")).forEach((element) => element.classList.add("biResponsiveControl"));
    };

    enhance();
    const observer = new MutationObserver(() => enhance());
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <div ref={rootRef} className="biResponsiveRoot">
    <BusinessIntelligence />
    <style jsx global>{`
      .biResponsiveRoot { width: 100%; }
      .biResponsiveRoot .biResponsiveMain { overflow-x: clip; }
      .biResponsiveRoot .biResponsiveMetricCard { cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
      .biResponsiveRoot .biResponsiveMetricCard:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(18,49,59,.10) !important; border-color: #b8d3cd !important; }
      .biResponsiveRoot .biResponsiveMetricCard:focus-visible { outline: 3px solid rgba(8,125,120,.25); outline-offset: 2px; }
      .biResponsiveRoot .biResponsiveCard { transition: box-shadow .18s ease, border-color .18s ease; }
      .biResponsiveRoot .biResponsiveCard:hover { border-color: #cfdfdb !important; }
      .biResponsiveRoot .biResponsiveTab { min-height: 60px; transition: transform .15s ease; }
      .biResponsiveRoot .biResponsiveTab:hover { transform: translateY(-1px); }
      .biResponsiveRoot .biResponsiveControl:focus-visible { outline: 3px solid rgba(8,125,120,.22) !important; outline-offset: 2px; }

      @media (max-width: 1100px) {
        .biResponsiveRoot .biResponsiveMetrics { grid-template-columns: repeat(3,minmax(0,1fr)) !important; }
        .biResponsiveRoot .biResponsiveSection[style*="grid"] { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
      }

      @media (max-width: 820px) {
        .biResponsiveRoot .biResponsiveMain { padding: 12px !important; }
        .biResponsiveRoot .biResponsiveHeader { align-items: flex-start !important; gap: 12px !important; }
        .biResponsiveRoot .biResponsiveTabs {
          position: sticky !important;
          top: 4px !important;
          z-index: 60 !important;
          display: flex !important;
          overflow-x: auto !important;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          padding: 5px !important;
          background: rgba(244,248,247,.94) !important;
          backdrop-filter: blur(14px);
          border-radius: 15px;
        }
        .biResponsiveRoot .biResponsiveTabs::-webkit-scrollbar { display: none; }
        .biResponsiveRoot .biResponsiveTab { min-width: 145px !important; flex: 0 0 145px !important; scroll-snap-align: start; min-height: 56px; }
        .biResponsiveRoot .biResponsiveMetrics {
          display: flex !important;
          overflow-x: auto !important;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          padding-bottom: 4px;
        }
        .biResponsiveRoot .biResponsiveMetrics::-webkit-scrollbar { display: none; }
        .biResponsiveRoot .biResponsiveMetricCard { flex: 0 0 min(43vw,210px) !important; min-width: min(43vw,210px) !important; scroll-snap-align: start; }
        .biResponsiveRoot .biResponsiveSection[style*="grid"] { grid-template-columns: 1fr !important; }
        .biResponsiveRoot .biResponsiveToolbar {
          position: sticky !important;
          top: 72px !important;
          z-index: 40 !important;
          display: grid !important;
          grid-template-columns: minmax(0,1fr) minmax(145px,.45fr) !important;
          box-shadow: 0 8px 22px rgba(18,49,59,.07) !important;
        }
        .biResponsiveRoot .biResponsiveToolbar > div:first-child { grid-column: 1 / -1; width: 100% !important; }
        .biResponsiveRoot .biResponsiveSelect { width: 100% !important; min-width: 0 !important; }
        .biResponsiveRoot .biResponsiveLeadCard { grid-template-columns: 1fr !important; align-items: stretch !important; }
        .biResponsiveRoot .biResponsiveLeadActions { justify-content: flex-start !important; border-top: 1px solid #edf2f0; padding-top: 11px; }
        .biResponsiveRoot .biResponsiveOperationRow { align-items: flex-start !important; }
      }

      @media (max-width: 560px) {
        .biResponsiveRoot .biResponsiveMain { padding: 8px 8px 18px !important; }
        .biResponsiveRoot .biResponsiveHeader > button { width: 100% !important; }
        .biResponsiveRoot .biResponsiveTabs { margin-inline: -2px !important; gap: 5px !important; }
        .biResponsiveRoot .biResponsiveTab { min-width: 118px !important; flex-basis: 118px !important; padding: 8px 10px !important; }
        .biResponsiveRoot .biResponsiveTab small { display: none !important; }
        .biResponsiveRoot .biResponsiveMetricCard { flex-basis: 72vw !important; min-width: 72vw !important; min-height: 105px !important; }
        .biResponsiveRoot .biResponsiveCard { border-radius: 15px !important; padding: 14px !important; }
        .biResponsiveRoot .biResponsiveToolbar { top: 64px !important; grid-template-columns: 1fr 1fr !important; padding: 8px !important; }
        .biResponsiveRoot .biResponsiveLeadCard { padding: 13px !important; gap: 10px !important; }
        .biResponsiveRoot .biResponsiveLeadActions {
          display: grid !important;
          grid-template-columns: repeat(3,minmax(0,1fr)) !important;
          gap: 6px !important;
          width: 100%;
        }
        .biResponsiveRoot .biResponsiveLeadActions button { min-height: 42px !important; width: 100%; padding: 7px 6px !important; }
        .biResponsiveRoot .biResponsiveOperationRow { flex-direction: column !important; align-items: stretch !important; gap: 9px !important; }
        .biResponsiveRoot .biResponsiveOperationRow > div:last-child { justify-content: flex-start !important; }
        .biResponsiveRoot .biResponsiveModalBackdrop {
          align-items: end !important;
          place-items: end stretch !important;
          padding: 0 !important;
        }
        .biResponsiveRoot .biResponsiveModalCard {
          width: 100% !important;
          max-height: 92vh;
          overflow-y: auto;
          border-radius: 22px 22px 0 0 !important;
          padding: 16px 14px calc(16px + env(safe-area-inset-bottom)) !important;
          box-shadow: 0 -18px 55px rgba(8,29,37,.22) !important;
        }
        .biResponsiveRoot .biResponsiveModalCard::before {
          content: "";
          display: block;
          width: 42px;
          height: 4px;
          border-radius: 999px;
          background: #d5e1de;
          margin: -3px auto 12px;
        }
        .biResponsiveRoot .biResponsiveModalCard > div:last-child { position: sticky; bottom: -16px; background: #fff; padding-top: 10px; }
      }

      @media (max-width: 390px) {
        .biResponsiveRoot .biResponsiveTab { min-width: 108px !important; flex-basis: 108px !important; }
        .biResponsiveRoot .biResponsiveMetricCard { flex-basis: 80vw !important; min-width: 80vw !important; }
        .biResponsiveRoot .biResponsiveLeadActions { grid-template-columns: 1fr 1fr !important; }
        .biResponsiveRoot .biResponsiveLeadActions button:nth-child(3) { grid-column: 1 / -1; }
      }

      @media (prefers-reduced-motion: reduce) {
        .biResponsiveRoot .biResponsiveMetricCard,
        .biResponsiveRoot .biResponsiveTab { transition: none !important; }
      }
    `}</style>
  </div>;
}
