import { describe, expect, it } from "vitest";
import {
  buildHumanFollowUpSuggestion,
  deriveHumanFollowUpDue,
  humanFollowUpInitialWaitHours,
  humanFollowUpReason,
  isHumanFollowUpEligible,
  nextHumanFollowUpAt
} from "@/lib/human-follow-ups";

describe("human follow-up planning", () => {
  it("prioritises hot and payment-stage leads sooner", () => {
    expect(humanFollowUpInitialWaitHours({ status: "PAYMENT PENDING", priority: "STANDARD" })).toBe(3);
    expect(humanFollowUpInitialWaitHours({ status: "INTERESTED", priority: "WARM" })).toBe(4);
    expect(humanFollowUpInitialWaitHours({ status: "NEW LEAD", priority: "STANDARD" })).toBe(6);
  });

  it("respects a manually scheduled follow-up after the latest client message", () => {
    const due = deriveHumanFollowUpDue(
      { status: "INTERESTED", priority: "WARM", followUpAt: "2026-08-25T08:00:00.000Z" },
      "2026-08-20T08:00:00.000Z"
    );
    expect(due?.toISOString()).toBe("2026-08-25T08:00:00.000Z");
  });

  it("recalculates from the latest client message when an old follow-up date is stale", () => {
    const due = deriveHumanFollowUpDue(
      { status: "INTERESTED", priority: "WARM", followUpAt: "2026-08-19T08:00:00.000Z" },
      "2026-08-20T08:00:00.000Z"
    );
    expect(due?.toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });

  it("defaults the next human follow-up to 24 hours later", () => {
    const next = nextHumanFollowUpAt("tomorrow", null, new Date("2026-08-20T08:00:00.000Z"));
    expect(next?.toISOString()).toBe("2026-08-21T08:00:00.000Z");
  });

  it("rejects closed leads from the human queue", () => {
    expect(isHumanFollowUpEligible({ status: "CONVERTED" })).toBe(false);
    expect(isHumanFollowUpEligible({ status: "LOST LEAD" })).toBe(false);
    expect(isHumanFollowUpEligible({ status: "INTERESTED" })).toBe(true);
  });

  it("provides stage-aware reasons and non-pushy human suggestions", () => {
    expect(humanFollowUpReason({ status: "PAYMENT PENDING", serviceInterest: "Research Proposal", packageName: null })).toMatch(/Payment-stage/);
    const suggestion = buildHumanFollowUpSuggestion({ name: "Brian Mulowa", status: "INTERESTED", serviceInterest: "Research Proposal", packageName: null, deadline: "January 2027" }, 1);
    expect(suggestion).toContain("Brian");
    expect(suggestion).toContain("Research Proposal");
    expect(suggestion).not.toMatch(/limited|urgent|last chance/i);
  });
});
