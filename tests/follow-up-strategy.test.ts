import { describe, expect, it } from "vitest";
import { buildFollowUpFallback, followUpAngle, followUpDelayHours, FOLLOW_UP_STEPS, leadFollowUpRank } from "@/lib/follow-up-strategy";

const standardLead = {
  name: "Blossom",
  serviceInterest: "Research support",
  packageName: null,
  deadline: null,
  status: "QUALIFIED" as const,
  priority: "STANDARD" as const
};

describe("automated follow-up conversion strategy", () => {
  it("keeps the first standard follow-up inside the 24-hour WhatsApp window", () => {
    expect(followUpDelayHours(standardLead, 0)).toBe(12);
  });

  it("prioritizes hot and payment-pending leads earlier", () => {
    expect(followUpDelayHours({ status: "PAYMENT PENDING", priority: "HOT" }, 0)).toBe(8);
    expect(leadFollowUpRank({ status: "PAYMENT PENDING", priority: "HOT" })).toBeGreaterThan(
      leadFollowUpRank({ status: "NEW LEAD", priority: "STANDARD" })
    );
  });

  it("uses a restrained four-touch sequence", () => {
    expect(FOLLOW_UP_STEPS).toBe(4);
    expect(followUpDelayHours(standardLead, 1)).toBe(72);
    expect(followUpDelayHours(standardLead, 2)).toBe(168);
    expect(followUpDelayHours(standardLead, 3)).toBe(336);
    expect(followUpDelayHours(standardLead, 4)).toBeNull();
  });

  it("moves from goal salience to uncertainty reduction and then autonomy", () => {
    expect(followUpAngle(0)).toBe("goal");
    expect(followUpAngle(1)).toBe("reduce_uncertainty");
    expect(followUpAngle(2)).toBe("deadline_or_value");
    expect(followUpAngle(3)).toBe("final_autonomy");
  });

  it("uses the client's real deadline without fabricating scarcity", () => {
    const message = buildFollowUpFallback({ ...standardLead, deadline: "Friday" }, 2);
    expect(message).toContain("Friday");
    expect(message.toLowerCase()).not.toContain("limited");
    expect(message.toLowerCase()).not.toContain("last chance");
  });

  it("ends the sequence without pressure", () => {
    const message = buildFollowUpFallback(standardLead, 3);
    expect(message).toContain("close the loop");
    expect(message).toContain("reply here");
    expect(message).not.toContain("?");
  });
});
