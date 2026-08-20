import { describe, expect, it } from "vitest";
import { casualConversationFallback, isCasualConversationTurn } from "@/lib/conversation-smalltalk";

describe("casual conversation routing", () => {
  it.each([
    "Hey",
    "Hello Mary",
    "How are you?",
    "Hey, how are you?",
    "I'm fine thanks",
    "Thank you",
    "Goodnight",
    "😂"
  ])("keeps %s out of sales qualification", (text) => {
    expect(isCasualConversationTurn(text)).toBe(true);
  });

  it.each([
    "Hi, how much is a research proposal?",
    "How are you, and can you resend my quotation?",
    "Hello, I need Pa Gym OSCE preparation",
    "Thanks, how do I pay?",
    "Hey, I need WhatsApp automation"
  ])("does not hide business intent in %s", (text) => {
    expect(isCasualConversationTurn(text)).toBe(false);
  });

  it("has a natural wellbeing fallback", () => {
    expect(casualConversationFallback("How are you?")).toMatch(/I’m good, thanks/i);
  });
});
