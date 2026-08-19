import { describe, expect, it } from "vitest";
import { buildBusinessAnalytics } from "@/lib/business-analytics";

const now = new Date("2026-08-19T12:00:00.000Z");

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    phone: "260977000000",
    name: "Client",
    status: "NEW LEAD",
    createdAt: "2026-08-10T10:00:00.000Z",
    serviceInterest: "Research support",
    packageName: null,
    deadline: "2026-08-30",
    followUpAt: null,
    source: "whatsapp",
    scoreBand: "WARM",
    leadScore: 55,
    inactiveDays: 1,
    lostReason: null,
    ...overrides
  };
}

describe("Business Intelligence analytics", () => {
  it("builds acquisition cohorts and verified revenue trends from recorded data", () => {
    const converted = lead({ id: "lead-1", status: "CONVERTED", createdAt: "2026-08-10T10:00:00.000Z" });
    const open = lead({ id: "lead-2", status: "QUALIFIED", createdAt: "2026-08-10T11:00:00.000Z" });
    const analytics = buildBusinessAnalytics({
      leads: [converted, open],
      payments: [{ lead_id: "lead-1", status: "VERIFIED", amount_zmw: 1500, verified_at: "2026-08-12T09:00:00.000Z" }],
      quotes: [], tasks: []
    }, 30, now);

    expect(analytics.summary.periodLeads).toBe(2);
    expect(analytics.summary.verifiedRevenue).toBe(1500);
    expect(analytics.leadTrend.some((row) => row.newLeads === 2 && row.cohortConversionRate === 50)).toBe(true);
  });

  it("flags interested leads without quotations and payment-stage workflow mismatches", () => {
    const interested = lead({ id: "lead-interest", status: "INTERESTED", scoreBand: "HOT", leadScore: 82, inactiveDays: 4 });
    const paying = lead({ id: "lead-pay", status: "PAYMENT PENDING", scoreBand: "HOT", leadScore: 90, inactiveDays: 1 });
    const analytics = buildBusinessAnalytics({ leads: [interested, paying], payments: [], quotes: [], tasks: [] }, 90, now);

    expect(analytics.gaps.find((gap) => gap.key === "interested-no-quote")?.count).toBe(1);
    expect(analytics.gaps.find((gap) => gap.key === "payment-stage-no-record")?.count).toBe(1);
    expect(analytics.gaps.find((gap) => gap.key === "hot-unconverted")?.count).toBe(2);
  });

  it("does not call cohort conversion a conversion-event timeline", () => {
    const analytics = buildBusinessAnalytics({ leads: [], payments: [], quotes: [], tasks: [] }, 90, now);
    expect(analytics.limitations.join(" ")).toMatch(/not a historical conversion-event timeline/i);
  });
});
