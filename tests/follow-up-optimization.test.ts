import { describe, expect, it } from "vitest";
import { buildFollowUpFallback, computeFollowUpDue, initialFollowUpWaitHours, isMedMindsContactHour } from "@/lib/follow-up";
import type { Lead } from "@/lib/types";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    phone: "260977000000",
    name: "Blossom",
    email: null,
    institution: null,
    programme: null,
    serviceInterest: "Research support",
    deadline: null,
    packageName: null,
    status: "QUALIFIED",
    handoffReason: null,
    aiPaused: false,
    assignedTo: null,
    internalNote: null,
    priority: "STANDARD",
    followUpAt: null,
    source: "whatsapp",
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    ...overrides
  };
}

describe("automated follow-up conversion cadence", () => {
  it("follows hot/payment-pending leads sooner while staying non-immediate", () => {
    expect(initialFollowUpWaitHours(lead({ status: "PAYMENT PENDING" }))).toBe(3);
    expect(initialFollowUpWaitHours(lead({ status: "INTERESTED" }))).toBe(4);
    expect(initialFollowUpWaitHours(lead({ status: "NEW LEAD" }))).toBe(6);
  });

  it("respects a client's explicit later follow-up time", () => {
    const due = computeFollowUpDue({
      anchorUserAt: "2026-08-16T10:00:00.000Z",
      step: 0,
      lastSentAt: null,
      lead: lead({ status: "FOLLOW-UP REQUIRED", followUpAt: "2026-08-19T10:00:00.000Z" })
    });
    expect(due?.toISOString()).toBe("2026-08-19T10:00:00.000Z");
  });

  it("spaces later touches from the actual previous send instead of catching up aggressively", () => {
    const due = computeFollowUpDue({
      anchorUserAt: "2026-08-16T10:00:00.000Z",
      step: 1,
      lastSentAt: "2026-08-17T08:00:00.000Z",
      lead: lead()
    });
    expect(due?.toISOString()).toBe("2026-08-19T02:00:00.000Z");
  });

  it("uses a specific micro-close rather than a generic check-in for interested leads", () => {
    const text = buildFollowUpFallback(lead({ status: "INTERESTED" }), 0);
    expect(text.toLowerCase()).not.toContain("just checking");
    expect(text).toContain("prepare the quotation");
    expect((text.match(/\?/g) || []).length).toBe(1);
  });

  it("makes the final touch explicitly low pressure", () => {
    const text = buildFollowUpFallback(lead(), 4);
    expect(text.toLowerCase()).toContain("final check-in");
    expect(text.toLowerCase()).toContain("no problem");
  });

  it("limits automated sends to MedMinds daytime hours in Lusaka", () => {
    expect(isMedMindsContactHour(new Date("2026-08-16T06:00:00.000Z"))).toBe(true); // 08:00 CAT
    expect(isMedMindsContactHour(new Date("2026-08-16T18:00:00.000Z"))).toBe(true); // 20:00 CAT
    expect(isMedMindsContactHour(new Date("2026-08-16T22:00:00.000Z"))).toBe(false); // 00:00 CAT
  });
});
