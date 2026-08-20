import type { Lead } from "@/lib/types";

export function manualFollowUpOptions(leads: Lead[]) {
  return [...leads]
    .filter((lead) => !["CONVERTED", "LOST LEAD"].includes(lead.status))
    .sort((left, right) => {
      const leftName = (left.name || left.phone).toLowerCase();
      const rightName = (right.name || right.phone).toLowerCase();
      return leftName.localeCompare(rightName);
    });
}
