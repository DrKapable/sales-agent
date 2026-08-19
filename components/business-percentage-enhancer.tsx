"use client";

import { useEffect } from "react";

function numberFrom(value: string | null | undefined) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function percent(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function updateText(node: Element | null, value: string) {
  if (node && node.textContent !== value) node.textContent = value;
}

function enhanceBusinessPercentages() {
  const root = document.querySelector<HTMLElement>(".biResponsiveRoot");
  if (!root) return;

  const articles = Array.from(root.querySelectorAll<HTMLElement>("article"));
  const totalCard = articles.find((article) => /^Total leads/i.test((article.textContent || "").trim()));
  const conversionCard = articles.find((article) => /^Conversion/i.test((article.textContent || "").trim()));
  if (totalCard && conversionCard) {
    const total = numberFrom(totalCard.querySelector("strong")?.textContent);
    const convertedHint = Array.from(conversionCard.querySelectorAll("small")).find((node) => /converted/i.test(node.textContent || ""));
    const converted = numberFrom(convertedHint?.textContent);
    updateText(conversionCard.querySelector("strong"), `${percent(total ? (converted / total) * 100 : 0)}%`);
  }

  const serviceCard = articles.find((article) => article.textContent?.includes("Services generating enquiries"));
  if (!serviceCard) return;
  const rows = Array.from(serviceCard.children).filter((child) => {
    const element = child as HTMLElement;
    return element.tagName === "DIV" && /\b\d+\s+leads?\b/i.test(element.textContent || "") && Boolean(element.querySelector(":scope > span"));
  }) as HTMLElement[];
  if (!rows.length) return;

  const parsed = rows.map((row) => {
    const detail = row.querySelector<HTMLElement>(":scope > div > div");
    const badge = row.querySelector<HTMLElement>(":scope > span");
    const leads = numberFrom(detail?.textContent);
    if (badge && !badge.dataset.biConversionRate) badge.dataset.biConversionRate = badge.textContent?.trim() || "0%";
    return { detail, badge, leads };
  });
  const total = parsed.reduce((sum, row) => sum + row.leads, 0);

  parsed.forEach(({ detail, badge, leads }) => {
    if (!badge) return;
    const share = total ? (leads / total) * 100 : 0;
    const conversion = badge.dataset.biConversionRate || "0%";
    const shareText = `${percent(share)}%`;
    updateText(badge, shareText);
    badge.title = `${shareText} of all enquiries`;
    badge.setAttribute("aria-label", `${shareText} of all enquiries`);
    updateText(detail, `${leads} lead${leads === 1 ? "" : "s"} · ${conversion} conversion`);
  });

  const subtitle = Array.from(serviceCard.querySelectorAll("p")).find((node) => /lead volume and observed conversion/i.test(node.textContent || ""));
  updateText(subtitle, "Lead volume, share of all enquiries and observed conversion by service.");
}

export function BusinessPercentageEnhancer() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        enhanceBusinessPercentages();
      });
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
