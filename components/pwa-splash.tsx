"use client";

import { useEffect, useState } from "react";

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

export function PwaSplash() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!isStandaloneMode()) return;
    setVisible(true);

    const leaveTimer = window.setTimeout(() => setLeaving(true), 760);
    const removeTimer = window.setTimeout(() => setVisible(false), 1040);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`pwaStartupSplash${leaving ? " isLeaving" : ""}`} aria-hidden="true">
      <div className="pwaStartupSplashInner">
        <img className="pwaStartupSplashIcon" src="/pwa-icon-512.png" alt="" />
        <div className="pwaStartupSplashCopy">
          <div className="pwaStartupSplashTitle">MedMinds Sales Agent</div>
          <div className="pwaStartupSplashSubtitle">Client conversations · Leads · Business intelligence</div>
        </div>
        <div className="pwaStartupSplashBar"><span /></div>
        <div className="pwaStartupSplashStatus">Opening your workspace…</div>
      </div>
    </div>
  );
}
