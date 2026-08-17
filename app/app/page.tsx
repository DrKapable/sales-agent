"use client";

import { useEffect } from "react";

export default function PwaLaunchPage() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.replace("/admin");
    }, 180);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#ffffff", padding: 24 }}>
      <div style={{ width: "min(84vw, 460px)", textAlign: "center", color: "#203952", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" }}>
        <img src="/medminds-logo.png" alt="MedMinds Learning Centre" style={{ display: "block", width: "100%", height: "auto" }} />
        <p style={{ margin: "20px 0 0", fontSize: 14, fontWeight: 700, color: "#5f7280" }}>Opening MedMinds Sales Agent…</p>
      </div>
    </main>
  );
}
