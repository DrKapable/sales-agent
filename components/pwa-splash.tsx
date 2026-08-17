"use client";

import { useEffect, useState } from "react";

type SplashPhase = "visible" | "leaving" | "hidden";

export function PwaSplash() {
  const [phase, setPhase] = useState<SplashPhase>("visible");

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (!standalone) {
      setPhase("hidden");
      return;
    }

    let started = false;
    let fadeTimer = 0;
    let hideTimer = 0;
    const beginExit = () => {
      if (started) return;
      started = true;
      fadeTimer = window.setTimeout(() => {
        setPhase("leaving");
        hideTimer = window.setTimeout(() => setPhase("hidden"), 240);
      }, 420);
    };

    if (document.readyState === "complete") beginExit();
    else window.addEventListener("load", beginExit, { once: true });
    const fallbackTimer = window.setTimeout(beginExit, 1100);

    return () => {
      window.removeEventListener("load", beginExit);
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return <div className={`pwaStartupSplash${phase === "leaving" ? " isLeaving" : ""}`} aria-hidden="true">
    <div className="pwaStartupSplashInner">
      <img src="/medminds-logo.png" alt="" />
      <div className="pwaStartupSplashBar"><span /></div>
    </div>
  </div>;
}
