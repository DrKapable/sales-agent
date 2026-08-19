"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";

type GapFilter = "all" | "high" | "medium" | "low";
type InboxPattern = { key: string; label: string; count: number; detail: string; sampleLeads?: Array<{ id: string; name?: string | null; phone: string; excerpt?: string | null; status?: string; service?: string | null }> };
type AnalyticsPayload = { generatedAt?: string; inbox?: { analysedLeads?: number; analysedMessages?: number; patterns?: InboxPattern[] } };

function activeDays() {
  const active = document.querySelector<HTMLButtonElement>(".biaRange button.active")?.textContent || "90 days";
  if (/1\s*year/i.test(active)) return 365;
  const match = active.match(/\d+/);
  return match ? Number(match[0]) : 90;
}

function visibleAnalyticsShell() {
  return Array.from(document.querySelectorAll<HTMLElement>(".biaShell")).find((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || null;
}

function ensureHost(parent: Element | null, selector: string, before?: Element | null) {
  if (!parent) return null;
  let host = parent.querySelector<HTMLElement>(selector);
  if (!host) {
    host = document.createElement("div");
    host.dataset.analyticsUxHost = selector.includes("inbox") ? "inbox" : "filters";
    if (before) parent.insertBefore(host, before);
    else parent.appendChild(host);
  }
  return host;
}

function formattedDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function BusinessAnalyticsUXEnhancer() {
  const [inboxHost, setInboxHost] = useState<HTMLElement | null>(null);
  const [filterHost, setFilterHost] = useState<HTMLElement | null>(null);
  const [days, setDays] = useState(90);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [gapFilter, setGapFilter] = useState<GapFilter>("all");

  const syncHosts = useCallback(() => {
    if (!window.location.pathname.startsWith("/admin/business")) return;
    const shell = visibleAnalyticsShell();
    if (!shell) { setInboxHost(null); setFilterHost(null); return; }
    const gaps = shell.querySelector<HTMLElement>(".biaGaps");
    const gapGrid = gaps?.querySelector<HTMLElement>(".biaGapGrid") || null;
    const container = shell.querySelector<HTMLElement>(".biaContainer");
    const inbox = ensureHost(container, '[data-analytics-ux-host="inbox"]', gaps || null);
    const filters = ensureHost(gaps, '[data-analytics-ux-host="filters"]', gapGrid);
    setInboxHost((current) => current === inbox ? current : inbox);
    setFilterHost((current) => current === filters ? current : filters);
    const nextDays = activeDays();
    setDays((current) => current === nextDays ? current : nextDays);
  }, []);

  useEffect(() => {
    syncHosts();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; syncHosts(); });
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); if (frame) window.cancelAnimationFrame(frame); };
  }, [syncHosts]);

  useEffect(() => {
    if (!inboxHost) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/business/analytics?days=${days}`, { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Unable to load inbox intelligence.");
        if (!cancelled) setData(json);
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, inboxHost]);

  useEffect(() => {
    const shell = visibleAnalyticsShell();
    if (!shell) return;
    const gaps = Array.from(shell.querySelectorAll<HTMLElement>(".biaGap"));
    gaps.forEach((gap) => {
      const show = gapFilter === "all" || gap.classList.contains(gapFilter);
      gap.style.display = show ? "" : "none";
    });
  }, [gapFilter, filterHost, data]);

  const patterns = useMemo(() => (data?.inbox?.patterns || []).filter((row) => Number(row.count || 0) > 0).slice(0, 8), [data]);
  const patternCount = (key: string) => patterns.find((row) => row.key === key)?.count || 0;
  const gapCounts = useMemo(() => {
    if (!filterHost) return { all: 0, high: 0, medium: 0, low: 0 };
    const shell = visibleAnalyticsShell();
    const gaps = Array.from(shell?.querySelectorAll<HTMLElement>(".biaGap") || []);
    return { all: gaps.length, high: gaps.filter((node) => node.classList.contains("high")).length, medium: gaps.filter((node) => node.classList.contains("medium")).length, low: gaps.filter((node) => !node.classList.contains("high") && !node.classList.contains("medium")).length };
  }, [filterHost, data]);

  const inboxPanel = inboxHost ? createPortal(<section className="biaCard biaUxInbox">
    <div className="biaCardHead"><div><h2>Inbox intelligence</h2><p>Conversation-level signals from recent client and Mary messages, surfaced alongside the charts.</p></div><span className="biaTag">MESSAGES</span></div>
    <div className="biaUxInboxStats"><article><strong>{loading ? "…" : data?.inbox?.analysedLeads || 0}</strong><span>conversations analysed</span></article><article><strong>{loading ? "…" : data?.inbox?.analysedMessages || 0}</strong><span>messages screened</span></article><article><strong>{patternCount("buyer-intent")}</strong><span>buying-intent signals</span></article><article><strong>{patternCount("unanswered-client-question")}</strong><span>unanswered latest questions</span></article></div>
    {patterns.length ? <div className="biaUxPatterns">{patterns.map((row) => <details key={row.key} className="biaUxPattern"><summary><div><strong>{row.label}</strong><p>{row.detail}</p></div><span>{row.count}</span></summary>{row.sampleLeads?.length ? <div className="biaUxSamples">{row.sampleLeads.slice(0, 4).map((lead) => <div key={lead.id}><strong>{lead.name || lead.phone}</strong><span>{lead.excerpt || `${lead.status || ""} · ${lead.service || "Service not established"}`}</span></div>)}</div> : null}</details>)}</div> : <div className="biaUxEmpty">{loading ? "Screening recent inbox conversations…" : "No configured inbox signal is currently above zero."}</div>}
    {data?.generatedAt ? <small className="biaUxUpdated">Inbox screening updated {formattedDate(data.generatedAt)}</small> : null}
  </section>, inboxHost) : null;

  const filterPanel = filterHost ? createPortal(<div className="biaUxGapFilters" role="group" aria-label="Gap severity filter">{(["all", "high", "medium", "low"] as GapFilter[]).map((value) => <button key={value} aria-pressed={gapFilter === value} className={gapFilter === value ? "active" : ""} onClick={() => setGapFilter(value)}>{value.charAt(0).toUpperCase() + value.slice(1)} <span>{gapCounts[value]}</span></button>)}</div>, filterHost) : null;

  return <>{inboxPanel}{filterPanel}<style jsx global>{`
    .biaShell{padding:clamp(10px,2.2vw,28px)}.biaHeader{display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:end!important}.biaHeaderActions{justify-content:flex-end}.biaMetrics{grid-template-columns:repeat(6,minmax(0,1fr))}.biaChartWrap{overflow-x:auto!important;overscroll-behavior-inline:contain;scrollbar-width:thin;scrollbar-color:#c5d5d1 transparent}.biaCard{box-shadow:0 9px 26px rgba(18,49,59,.05)!important}.biaGaps{margin-top:14px}.biaUxInbox{margin-bottom:14px}.biaUxInboxStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:10px}.biaUxInboxStats article{background:#f4f9f7;border:1px solid #deebe7;border-radius:12px;padding:11px}.biaUxInboxStats strong{display:block;font-size:22px}.biaUxInboxStats span{font-size:11px;color:#62756f}.biaUxPatterns{display:grid;gap:7px}.biaUxPattern{border:1px solid #e0e9e6;border-radius:11px;background:#fff;overflow:hidden}.biaUxPattern summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;cursor:pointer;list-style:none}.biaUxPattern summary::-webkit-details-marker{display:none}.biaUxPattern summary strong{font-size:12px}.biaUxPattern summary p{font-size:11px;color:#71827e;margin:2px 0 0}.biaUxPattern summary>span{font-size:22px;font-weight:900}.biaUxSamples{padding:0 10px 10px;display:grid;gap:6px}.biaUxSamples>div{display:grid;grid-template-columns:150px minmax(0,1fr);gap:10px;padding:8px;background:#f4f8f7;border-radius:8px;font-size:11px}.biaUxSamples span{color:#61736f;overflow-wrap:anywhere}.biaUxEmpty{padding:20px;text-align:center;color:#71827e}.biaUxUpdated{display:block;margin-top:9px;color:#81918d}.biaUxGapFilters{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 12px}.biaUxGapFilters button{min-height:38px;border:1px solid #d6e2df;background:#fff;border-radius:999px;padding:7px 10px;font-weight:800;color:#61736f;cursor:pointer}.biaUxGapFilters button span{opacity:.72}.biaUxGapFilters button.active{background:#123f4d;color:#fff;border-color:#123f4d}.biaUxGapFilters button:focus-visible,.biaUxPattern summary:focus-visible{outline:3px solid rgba(8,125,120,.25);outline-offset:2px}
    @media(max-width:1100px){.biaMetrics{grid-template-columns:repeat(3,minmax(0,1fr))}.biaUxInboxStats{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:720px){.biaShell{padding:8px!important}.biaHeader{grid-template-columns:1fr!important;gap:10px}.biaHeaderActions{display:grid!important;grid-template-columns:minmax(0,1fr) auto;width:100%;justify-content:stretch!important}.biaRange{overflow-x:auto;scrollbar-width:none}.biaRange button{white-space:nowrap;min-width:68px;min-height:44px}.biaRefresh{min-height:44px}.biaMetrics{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px;overflow:visible!important;padding-bottom:0!important}.biaMetrics article{flex:auto!important;min-width:0;padding:11px}.biaMetrics strong{font-size:23px}.biaMetrics span{font-size:10px}.biaMetrics small{font-size:10px}.biaCard{padding:13px;border-radius:14px}.biaChartWrap{margin:0 -4px;padding:0 4px 4px}.biaChartSvg{min-width:580px}.biaBars{min-width:560px}.biaServiceHeader{display:none!important}.biaServiceRow{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;padding:10px 0!important}.biaServiceRow strong{grid-column:1/-1;font-size:12px}.biaServiceRow>span{background:#f4f8f7;border-radius:8px;padding:7px;text-align:left}.biaServiceRow>span:nth-of-type(1)::before{content:'Leads';display:block;font-size:8px;text-transform:uppercase;color:#81918d}.biaServiceRow>span:nth-of-type(2)::before{content:'Converted';display:block;font-size:8px;text-transform:uppercase;color:#81918d}.biaServiceRow>span:nth-of-type(3)::before{content:'Rate';display:block;font-size:8px;text-transform:uppercase;color:#81918d}.biaUxInboxStats{grid-template-columns:1fr 1fr}.biaUxPattern summary p{display:none}.biaUxSamples>div{grid-template-columns:1fr}.biaAnalysis{font-size:12.5px!important;line-height:1.65!important}.biaAnalysisHead{flex-wrap:wrap}.biaAiIntro button,.biaAskRow button{min-height:44px}.biaGap summary{min-height:70px}}
    @media(max-width:390px){.biaHeaderActions{grid-template-columns:1fr!important}.biaRefresh{width:100%}.biaTitleRow h1{font-size:27px!important}.biaMetrics strong{font-size:21px}.biaUxInboxStats strong{font-size:20px}.biaUxGapFilters{display:grid;grid-template-columns:repeat(2,1fr)}.biaUxGapFilters button{width:100%;min-height:42px}}
    @media(prefers-reduced-motion:reduce){.biaShell *{scroll-behavior:auto!important}}
  `}</style></>;
}
