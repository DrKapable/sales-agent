import { describe, expect, it } from "vitest";
import { classifySalesTurn, shapeMaryReply } from "@/lib/conversation-optimization";

const lead = { status: "INTERESTED" as const, serviceInterest: "Research support", packageName: null };

describe("Mary conversation optimization", () => {
  it("qualifies hands-on research support intent", () => {
    const signal = classifySalesTurn("I need help with my proposal", { status: "NEW LEAD", serviceInterest: null, packageName: null });
    expect(signal.inferredService).toBe("Research support");
    expect(signal.serviceNeed).toBe(true);
  });

  it("preserves explicit self-directed proposal intent instead of flipping it to hands-on support", () => {
    const signal = classifySalesTurn("I have already started and I want to write it myself", {
      status: "QUALIFIED",
      serviceInterest: "Research support",
      packageName: null
    });
    expect(signal.inferredService).toBe("AI-Assisted Research Proposal Writing");
  });

  it("recognizes payment and proceed intent as closer signals", () => {
    expect(classifySalesTurn("Send me the payment details, I am ready to pay", lead).closerAttention).toBe(true);
    expect(classifySalesTurn("Let's proceed with it", lead).closerAttention).toBe(true);
  });

  it("routes engaged price and trust objections for closer attention", () => {
    const price = classifySalesTurn("That is too expensive for me", lead);
    const trust = classifySalesTurn("How do I know MedMinds is genuine?", lead);
    expect(price.objection).toBe("price");
    expect(price.closerAttention).toBe(true);
    expect(trust.objection).toBe("trust");
    expect(trust.closerAttention).toBe(true);
  });

  it("recognizes timing objections without treating them as a hard sale", () => {
    const signal = classifySalesTurn("Let me think about it, I will get back to you", lead);
    expect(signal.objection).toBe("timing");
    expect(signal.closerAttention).toBe(false);
  });

  it("enforces one question and keeps routine replies compact", () => {
    const signal = classifySalesTurn("I need help with my proposal", lead);
    const long = "I can help with that. What programme are you doing? What is your institution? What is your deadline? " + "MedMinds provides professional research support. ".repeat(25);
    const shaped = shapeMaryReply(long, "I need help with my proposal", signal);
    expect((shaped.match(/\?/g) || []).length).toBeLessThanOrEqual(1);
    expect(shaped.length).toBeLessThan(long.length);
  });

  it("removes a repeated stock acknowledgement while preserving the useful sales message", () => {
    const signal = classifySalesTurn("I have already started", lead);
    const shaped = shapeMaryReply(
      "That helps. Since you've already started, the self-paced course can help you strengthen what you have. Would you like the course fee?",
      "I have already started",
      signal,
      ["That helps. When do you need it completed?"]
    );
    expect(shaped).not.toMatch(/^That helps/i);
    expect(shaped).toContain("Since you've already started");
    expect((shaped.match(/\?/g) || []).length).toBe(1);
  });
});
