"use client";

import { useEffect, type ReactNode } from "react";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

export default function RootTemplate({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none"
        });
        if (!cancelled) void registration.update();
      } catch (error) {
        console.warn("MedMinds PWA service worker registration failed", error);
      }
    };

    // Register immediately instead of waiting for the full load event so Chromium
    // can evaluate PWA installability as early as possible on first use.
    void register();

    return () => {
      cancelled = true;
    };
  }, []);

  return <><PwaInstallPrompt />{children}</>;
}
