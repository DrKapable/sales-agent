import { describe, expect, it } from "vitest";
import { buildConversionFollowUp, followUpCadenceHours, nextFollowUpDue, shouldThrottleFollowUpRetry } from "@/lib/follow-up-strategy";

const baseLead = {
  name: "Jane Phiri",
  serviceInterest: "Research support",
  packageName: null,
  deadline: null,
  priority: "STANDARD" as const,
  status: "NEW LEAD" as const,
  followUpAt: null
};

describe("automated follow-up strategy", () => {
  it("schedules the first touch inside the WhatsApp free-form window", () => {
    expect(followUpCadenceHours(baseLead)[0]).toBeLessThan(24);
    expect(followUpCadenceHours({ priority: "HOT", status: "INTERESTED" })[0]).toBeLessThan(24);
  });

  it("follows hot leads faster than standard leads", () => {
    const hot = followUpCadenceHours({ priority: "HOT", status: "INTERESTED" });
    const standard = followUpCadenceHours({ priority: "STANDARD", status: "NEW LEAD" });
    expect(hot[0]).toBeLessThan(standard[0]);
  });

  it("honours a later explicit follow-up date for timing objections", () => {
    const anchor = "2026-08-16T10:00:00.000Z";
    const explicit = "2026-08-20T10:00:00.000Z";
    const due = nextFollowUpDue({
      lead: { priority: "STANDARD", status: "FOLLOW-UP REQUIRED", followUpAt: explicit },
      anchorUserAt: anchor,
      step: 0,
      lastSentAt: null
    });
    expect(due?.toISOString()).toBe(explicit);
  });

  it("uses relevance and a single low-friction question on the first research follow-up", () => {
    const strategy = buildConversionFollowUp({ lead: baseLead, step: 0, lastUserText: "Can I get more info on this?" });
    expect(strategy.frame).toBe("relevance");
    expect(strategy.message.toLowerCase()).toContain("research support");
    expect((strategy.message.match(/\?/g) || []).length).toBeLessThanOrEqual(1);
  });

  it("responds to price resistance without inventing a discount", () => {
    const strategy = buildConversionFollowUp({
      lead: { ...baseLead, status: "INTERESTED", priority: "WARM" },
      step: 0,
      lastUserText: "That is too expensive for me"
    });
    expect(strategy.message).toContain("approved option");
    expect(strategy.message.toLowerCase()).not.toContain("discounted price");
    expect(strategy.message.toLowerCase()).not.toContain("special offer");
  });

  it("ends the final touch by restoring client autonomy instead of pressuring them", () => {
    const cadence = followUpCadenceHours(baseLead);
    const strategy = buildConversionFollowUp({ lead: baseLead, step: cadence.length - 1, lastUserText: "Can I get more info on this?" });
    expect(strategy.frame).toBe("autonomy");
    expect(strategy.message.toLowerCase()).toContain("close this follow-up");
    expect((strategy.message.match(/\?/g) || []).length).toBe(0);
  });

  it("throttles repeated template/configuration failures", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    expect(shouldThrottleFollowUpRetry("template_required", "2026-08-16T06:00:00.000Z", now)).toBe(true);
    expect(shouldThrottleFollowUpRetry("template_required", "2026-08-15T20:00:00.000Z", now)).toBe(false);
  });
});
