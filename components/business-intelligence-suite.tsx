"use client";

import { useState } from "react";
import { BusinessAnalyticsPanel } from "@/components/business-analytics-panel";
import { BusinessIntelligenceResponsive } from "@/components/business-intelligence-responsive";

export function BusinessIntelligenceSuite() {
  const [section, setSection] = useState<"dashboard" | "analytics">("dashboard");

  return <div className="biSuite">
    <div className="biSuiteSwitchWrap"><div className="biSuiteSwitch" role="tablist" aria-label="Business Intelligence section"><button role="tab" aria-selected={section === "dashboard"} className={section === "dashboard" ? "active" : ""} onClick={() => setSection("dashboard")}><span>▦</span><strong>Business dashboard</strong><small>Leads, operations & Ask Intelligence</small></button><button role="tab" aria-selected={section === "analytics"} className={section === "analytics" ? "active" : ""} onClick={() => setSection("analytics")}><span>⌁</span><strong>Analytics & AI</strong><small>Charts, gaps & recommendations</small></button></div></div>
    {section === "dashboard" ? <BusinessIntelligenceResponsive /> : <BusinessAnalyticsPanel onBack={() => setSection("dashboard")} />}
    <style jsx global>{`
      .biSuite{min-height:100vh;background:#f4f8f7}.biSuiteSwitchWrap{background:#f4f8f7;padding:10px clamp(12px,2.4vw,30px) 0}.biSuiteSwitch{max-width:1440px;margin:0 auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:5px;border:1px solid #d7e3df;background:rgba(255,255,255,.9);border-radius:15px;box-shadow:0 6px 18px rgba(18,49,59,.04)}.biSuiteSwitch button{display:grid;grid-template-columns:28px 1fr;grid-template-rows:auto auto;column-gap:8px;align-items:center;text-align:left;border:1px solid transparent;background:transparent;border-radius:11px;padding:9px 11px;color:#49625c;cursor:pointer}.biSuiteSwitch button>span{grid-row:1/3;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:#eef4f2;color:#087d78;font-weight:900}.biSuiteSwitch strong{font-size:12.5px}.biSuiteSwitch small{font-size:10.5px;color:#778983;margin-top:1px}.biSuiteSwitch button.active{background:#123f4d;color:#fff;box-shadow:0 5px 14px rgba(18,63,77,.14)}.biSuiteSwitch button.active>span{background:rgba(255,255,255,.12);color:#fff}.biSuiteSwitch button.active small{color:#cfe0dc}@media(max-width:620px){.biSuiteSwitchWrap{padding:7px 8px 0}.biSuiteSwitch{gap:4px}.biSuiteSwitch button{grid-template-columns:24px 1fr;padding:8px}.biSuiteSwitch button>span{width:24px;height:24px}.biSuiteSwitch strong{font-size:11px}.biSuiteSwitch small{display:none}}
    `}</style>
  </div>;
}
