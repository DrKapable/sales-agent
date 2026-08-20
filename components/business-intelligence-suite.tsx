"use client";

import { useEffect, useState } from "react";
import { BusinessAnalyticsPanel } from "@/components/business-analytics-panel";
import { BusinessAnalyticsUXEnhancer } from "@/components/business-analytics-ux-enhancer";
import { BusinessIntelligenceResponsive } from "@/components/business-intelligence-responsive";
import { HumanFollowUpPanel } from "@/components/human-follow-up-panel";

type Section = "dashboard" | "analytics" | "followups";

export function BusinessIntelligenceSuite() {
  const [section, setSection] = useState<Section>("dashboard");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("section");
    if (requested === "analytics" || requested === "followups") setSection(requested);
  }, []);

  function changeSection(next: Section) {
    setSection(next);
    const url = new URL(window.location.href);
    if (next === "dashboard") url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return <div className="biSuite">
    <BusinessAnalyticsUXEnhancer />
    <div className="biSuiteSwitchWrap"><div className="biSuiteSwitch" role="tablist" aria-label="Business Intelligence section">
      <button role="tab" aria-selected={section === "dashboard"} className={section === "dashboard" ? "active" : ""} onClick={() => changeSection("dashboard")}><span>▦</span><strong>Business dashboard</strong><small>Leads, operations & Ask Intelligence</small></button>
      <button role="tab" aria-selected={section === "analytics"} className={section === "analytics" ? "active" : ""} onClick={() => changeSection("analytics")}><span>⌁</span><strong>Analytics & AI</strong><small>Charts, inbox gaps & recommendations</small></button>
      <button role="tab" aria-selected={section === "followups"} className={section === "followups" ? "active" : ""} onClick={() => changeSection("followups")}><span>✓</span><strong>Follow-ups</strong><small>Human outreach, outcomes & next actions</small></button>
    </div></div>
    {section === "dashboard" ? <BusinessIntelligenceResponsive /> : section === "analytics" ? <BusinessAnalyticsPanel onBack={() => changeSection("dashboard")} /> : <HumanFollowUpPanel onBack={() => changeSection("dashboard")} />}
    <style jsx global>{`
      .biSuite{min-height:100vh;background:#f4f8f7}.biSuiteSwitchWrap{background:#f4f8f7;padding:10px clamp(12px,2.4vw,30px) 0}.biSuiteSwitch{max-width:1440px;margin:0 auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:5px;border:1px solid #d7e3df;background:rgba(255,255,255,.94);border-radius:15px;box-shadow:0 6px 18px rgba(18,49,59,.04)}.biSuiteSwitch button{display:grid;grid-template-columns:28px 1fr;grid-template-rows:auto auto;column-gap:8px;align-items:center;text-align:left;border:1px solid transparent;background:transparent;border-radius:11px;padding:9px 11px;color:#49625c;cursor:pointer;min-height:48px;min-width:0}.biSuiteSwitch button>span{grid-row:1/3;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:#eef4f2;color:#087d78;font-weight:900}.biSuiteSwitch strong{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.biSuiteSwitch small{font-size:10.5px;color:#778983;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.biSuiteSwitch button.active{background:#123f4d;color:#fff;box-shadow:0 5px 14px rgba(18,63,77,.14)}.biSuiteSwitch button.active>span{background:rgba(255,255,255,.12);color:#fff}.biSuiteSwitch button.active small{color:#cfe0dc}.biSuiteSwitch button:focus-visible{outline:3px solid rgba(8,125,120,.25);outline-offset:2px}
      @media(max-width:760px){.biSuiteSwitchWrap{position:sticky;top:0;z-index:50;padding:6px 8px;background:rgba(244,248,247,.96);backdrop-filter:blur(10px);overflow:hidden}.biSuiteSwitch{display:flex;gap:4px;border-radius:12px;overflow-x:auto;scrollbar-width:none}.biSuiteSwitch::-webkit-scrollbar{display:none}.biSuiteSwitch button{flex:0 0 auto;display:flex;gap:7px;padding:7px 9px;min-height:44px;min-width:max-content}.biSuiteSwitch button>span{flex:0 0 24px;width:24px;height:24px}.biSuiteSwitch strong{font-size:11.5px;white-space:nowrap}.biSuiteSwitch small{display:none}}
      @media(max-width:390px){.biSuiteSwitch button{padding-inline:8px}.biSuiteSwitch strong{font-size:11px}}
      @media(prefers-reduced-motion:reduce){.biSuiteSwitchWrap{backdrop-filter:none}}
    `}</style>
  </div>;
}
