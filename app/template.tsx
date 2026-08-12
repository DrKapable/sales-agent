"use client";

import { useEffect, type ReactNode } from "react";

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

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
    };
  }, []);

  return <>{children}</>;
}
