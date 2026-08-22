"use client";

import { useEffect } from "react";

const SORTABLE_CHARTS = [
  { title: "Current pipeline distribution", valueSelector: ".biaHbar strong", labelSelector: ".biaHbar span" },
  { title: "Service performance", valueSelector: ".biaServiceRow > span:nth-of-type(1)", labelSelector: ".biaServiceRow strong" },
  { title: "Lead source mix", valueSelector: ".biaLegend strong", labelSelector: ".biaLegend > div > span:nth-of-type(2)" }
] as const;

type SortMode = "default" | "value" | "alpha";

function numericValue(text: string | null | undefined) {
  const match = String(text || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function BusinessAnalyticsSortEnhancer() {
  useEffect(() => {
    const enhance = () => {
      for (const config of SORTABLE_CHARTS) {
        const cards = Array.from(document.querySelectorAll<HTMLElement>(".biaCard"));
        const card = cards.find((candidate) => candidate.querySelector("h2")?.textContent?.trim() === config.title);
        if (!card || card.dataset.sortReady === "1") continue;

        const header = card.querySelector<HTMLElement>(".biaCardHead");
        const content = config.title === "Current pipeline distribution"
          ? card.querySelector<HTMLElement>(".biaHbars")
          : config.title === "Service performance"
            ? card.querySelector<HTMLElement>(".biaServiceTable")
            : card.querySelector<HTMLElement>(".biaLegend");
        if (!header || !content) continue;

        card.dataset.sortReady = "1";
        const original = Array.from(content.children);
        const fixedHeader = config.title === "Service performance" ? original.shift() ?? null : null;
        const originalRows = [...original];

        const wrap = document.createElement("label");
        wrap.className = "biaChartSort";
        wrap.textContent = "Order";
        const select = document.createElement("select");
        select.setAttribute("aria-label", `Sort ${config.title}`);
        select.innerHTML = '<option value="default">Default</option><option value="value">Highest first</option><option value="alpha">A–Z</option>';
        wrap.appendChild(select);
        header.appendChild(wrap);

        const render = (mode: SortMode) => {
          const rows = [...originalRows];
          if (mode === "value") {
            rows.sort((a, b) => numericValue(b.querySelector(config.valueSelector)?.textContent) - numericValue(a.querySelector(config.valueSelector)?.textContent));
          } else if (mode === "alpha") {
            rows.sort((a, b) => String(a.querySelector(config.labelSelector)?.textContent || "").localeCompare(String(b.querySelector(config.labelSelector)?.textContent || "")));
          }
          content.replaceChildren(...(fixedHeader ? [fixedHeader, ...rows] : rows));
        };

        select.addEventListener("change", () => render(select.value as SortMode));
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
