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
  const [installBusy, setInstallBusy] = useState(false);

  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(userAgent), [userAgent]);
  const isAndroid = useMemo(() => /android/i.test(userAgent), [userAgent]);

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
      setInstallBusy(false);
      try { window.localStorage.removeItem(DISMISS_KEY); } catch {}
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS does not expose beforeinstallprompt, so Safari needs manual guidance.
    // Android intentionally has no manual fallback. We only offer the install button
    // after Chromium has confirmed that the current app can trigger its install flow.
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
    setInstallBusy(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      setInstallBusy(true);
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
      } finally {
        setInstallBusy(false);
      }
      return;
    }

    if (isIos) setManualMode("ios");
  };

  const promptText = manualMode === "ios"
    ? "Tap Share in Safari, then choose Add to Home Screen."
    : "Install MedMinds for faster access and a standalone app experience when supported by this device.";

  return (
    <div style={{ position: "fixed", inset: "auto 12px 14px 12px", zIndex: 2147483000, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <section role="region" aria-labelledby="medminds-install-title" style={{ pointerEvents: "auto", width: "min(100%, 440px)", borderRadius: 20, border: "1px solid #d7e5e5", background: "rgba(255,255,255,.98)", boxShadow: "0 18px 60px rgba(17,38,58,.22)", padding: 16, color: "#203952", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <img src="/pwa-icon-192.png" alt="" width={54} height={54} style={{ borderRadius: 14, flex: "0 0 auto" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="medminds-install-title" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>Install MedMinds Sales Agent</div>
            <div style={{ marginTop: 5, fontSize: 13, lineHeight: 1.5, color: "#60717f" }}>{promptText}</div>
            {isAndroid && deferredPrompt && (
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45, color: "#71828f" }}>
                Chrome may call the final confirmation “Add to Home screen”. On supported Android devices, the installed PWA opens from your launcher like an app.
              </div>
            )}
          </div>
          <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" style={{ border: 0, background: "transparent", color: "#60717f", fontSize: 24, lineHeight: 1, cursor: "pointer", padding: 2 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={install} disabled={installBusy} style={{ flex: 1, border: 0, borderRadius: 12, background: "#203952", color: "white", padding: "11px 14px", font: "inherit", fontSize: 14, fontWeight: 800, cursor: installBusy ? "wait" : "pointer", opacity: installBusy ? .72 : 1 }}>
            {installBusy ? "Opening installer…" : deferredPrompt ? "Install app" : "How to install"}
          </button>
          <button type="button" onClick={dismiss} style={{ border: "1px solid #d7e5e5", borderRadius: 12, background: "white", color: "#203952", padding: "11px 14px", font: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}
