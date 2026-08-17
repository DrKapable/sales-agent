"use client";

import { useEffect, useMemo, useState } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform?: string };
type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const DISMISS_KEY = "medminds-pwa-install-dismissed";
const DISMISS_MS = 3 * 24 * 60 * 60 * 1000;

function isStandalone() {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

function recentlyDismissed() {
  try {
    const value = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    return value > 0 && Date.now() - value < DISMISS_MS;
  } catch {
    return false;
  }
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEventLike | null>(null);
  const [visible, setVisible] = useState(false);
  const [manualMode, setManualMode] = useState<"ios" | null>(null);

  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(userAgent), [userAgent]);

  useEffect(() => {
    if (typeof window === "undefined" || isStandalone()) return;
    if (/^\/(widget|test-chat|documents)(\/|$)/.test(window.location.pathname)) return;
    if (recentlyDismissed()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEventLike);
      setManualMode(null);
      window.setTimeout(() => setVisible(true), 350);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
      setManualMode(null);
      try { window.localStorage.removeItem(DISMISS_KEY); } catch {}
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS does not expose beforeinstallprompt, so Safari still needs manual guidance.
    // Android intentionally has no manual fallback: showing Add to Home Screen before
    // Chromium marks the app installable can create a plain shortcut instead of a PWA.
    const iosFallbackTimer = window.setTimeout(() => {
      if (!isIos || isStandalone() || recentlyDismissed()) return;
      setManualMode("ios");
      setVisible(true);
    }, 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(iosFallbackTimer);
    };
  }, [isIos]);

  if (!visible) return null;

  const dismiss = () => {
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        if (choice.outcome === "accepted") {
          setVisible(false);
          return;
        }
      } catch (error) {
        console.warn("MedMinds install prompt failed", error);
      }
      return;
    }

    if (isIos) setManualMode("ios");
  };

  const promptText = manualMode === "ios"
    ? "Tap Share in Safari, then choose Add to Home Screen."
    : "Install the MedMinds Sales Agent as a standalone app for faster access from your home screen.";

  return (
    <div style={{ position: "fixed", inset: "auto 12px 14px 12px", zIndex: 2147483000, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <section aria-label="Install MedMinds Sales Agent" style={{ pointerEvents: "auto", width: "min(100%, 440px)", borderRadius: 20, border: "1px solid #d7e5e5", background: "rgba(255,255,255,.98)", boxShadow: "0 18px 60px rgba(17,38,58,.22)", padding: 16, color: "#203952", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <img src="/pwa-icon-192.png" alt="" width={54} height={54} style={{ borderRadius: 14, flex: "0 0 auto" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>Install MedMinds Sales Agent</div>
            <div style={{ marginTop: 5, fontSize: 13, lineHeight: 1.5, color: "#60717f" }}>{promptText}</div>
          </div>
          <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" style={{ border: 0, background: "transparent", color: "#60717f", fontSize: 24, lineHeight: 1, cursor: "pointer", padding: 2 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={install} style={{ flex: 1, border: 0, borderRadius: 12, background: "#203952", color: "white", padding: "11px 14px", font: "inherit", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            {deferredPrompt ? "Install app" : "How to install"}
          </button>
          <button type="button" onClick={dismiss} style={{ border: "1px solid #d7e5e5", borderRadius: 12, background: "white", color: "#203952", padding: "11px 14px", font: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}
