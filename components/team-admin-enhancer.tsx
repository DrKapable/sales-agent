"use client";

import { useEffect } from "react";
import { teamDirectory } from "@/lib/team-directory";

function addTeamOptions(select: HTMLSelectElement) {
  for (const member of teamDirectory) {
    if (Array.from(select.options).some((option) => option.value === member.name)) continue;
    const option = document.createElement("option");
    option.value = member.name;
    option.textContent = `${member.name} · ${member.roles.slice(0, 2).join(" / ")}`;
    select.appendChild(option);
  }
}

function syncTeamControls() {
  document.querySelectorAll<HTMLSelectElement>(".conversationPanel label select").forEach((select) => {
    const label = select.closest("label")?.textContent?.toLowerCase() ?? "";
    if (label.includes("assigned to") || label.includes("send as")) addTeamOptions(select);
  });

  const nav = document.querySelector<HTMLElement>(".sidebar nav");
  if (nav && !nav.querySelector(".businessIntelligenceLink")) {
    const link = document.createElement("a");
    link.href = "/admin/business";
    link.className = "businessIntelligenceLink";
    link.textContent = "Business Intelligence";
    link.style.cssText = "display:block;padding:10px 12px;border-radius:10px;color:inherit;text-decoration:none;font-weight:700;margin-top:4px";
    nav.appendChild(link);
  }

  const setupGrid = document.querySelector<HTMLElement>(".setupGrid");
  if (setupGrid && !setupGrid.querySelector(".teamDirectoryCard")) {
    const card = document.createElement("div");
    card.className = "webhookCard teamDirectoryCard";
    card.innerHTML = `<span>Referral team</span><p style="margin:6px 0 12px;color:#61736f">The AI routes human escalations by role. Administrators can still reassign any case manually.</p>${teamDirectory.map((member) => `<div style="padding:8px 0;border-top:1px solid #e3e9e6"><strong>${member.name}</strong><br><small style="color:#61736f">${member.roles.join(" · ")}</small></div>`).join("")}`;
    setupGrid.appendChild(card);
  }
}

export function TeamAdminEnhancer() {
  useEffect(() => {
    syncTeamControls();
    const observer = new MutationObserver(syncTeamControls);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
