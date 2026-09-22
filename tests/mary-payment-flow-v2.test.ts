import { describe, expect, it } from "vitest";
import { paymentJourneyIsActive } from "../lib/mary-payment-flow-v2";

describe("Mary payment journey guard", () => {
  it("does not reopen payment just because a pending client says hello", () => {
    expect(paymentJourneyIsActive({
      latest: "Hello",
      leadStatus: "PAYMENT PENDING",
      recentClientText: "Please send me the payment link",
      recentAssistantText: "Your secure Sampay payment request is ready. After payment, tell me here.",
    })).toBe(false);
  });

  it("does not reopen payment for a thank-you after a link was sent", () => {
    expect(paymentJourneyIsActive({
      latest: "Thank you",
      leadStatus: "PAYMENT PENDING",
      recentClientText: "I want to pay",
      recentAssistantText: "Your secure Sampay payment request is ready.",
    })).toBe(false);
  });

  it("starts payment when the latest message explicitly asks to pay", () => {
    expect(paymentJourneyIsActive({
      latest: "Send me the payment link",
      leadStatus: "INTERESTED",
      recentClientText: "",
      recentAssistantText: "",
    })).toBe(true);
  });

  it("continues only when the client is answering the immediate payment question", () => {
    expect(paymentJourneyIsActive({
      latest: "jumaphiri@example.com",
      leadStatus: "PAYMENT PENDING",
      recentClientText: "I want to pay",
      recentAssistantText: "What email address should I use for the payment request and official receipt?",
    })).toBe(true);
  });

  it("does not treat unrelated text as a payment continuation", () => {
    expect(paymentJourneyIsActive({
      latest: "Can you tell me more about the service?",
      leadStatus: "PAYMENT PENDING",
      recentClientText: "I want to pay",
      recentAssistantText: "Your secure Sampay payment request is ready.",
    })).toBe(false);
  });
});
