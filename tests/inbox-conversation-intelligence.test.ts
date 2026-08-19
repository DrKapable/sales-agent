import { describe, expect, it } from "vitest";
import { analyseConversationTurns } from "@/lib/inbox-conversation-intelligence";

describe("inbox conversation intelligence", () => {
  it("separates neutral pricing intent from an actual affordability objection", () => {
    const neutral = analyseConversationTurns([
      { role: "user", content: "How much is the quantitative analysis package?" }
    ]);
    expect(neutral.signals.buyerIntent).toBe(true);
    expect(neutral.signals.priceConcern).toBe(false);

    const objection = analyseConversationTurns([
      { role: "user", content: "That is too much for my budget. Can you give a discount?" }
    ]);
    expect(objection.signals.priceConcern).toBe(true);
  });

  it("detects trust concerns from actual client messages", () => {
    const result = analyseConversationTurns([
      { role: "user", content: "Before I pay, how do I know your organisation is legitimate?" }
    ]);
    expect(result.signals.trustConcern).toBe(true);
    expect(result.evidence.trustConcern?.[0]).toContain("legitimate");
  });

  it("detects repeated agent questions and stock acknowledgements", () => {
    const result = analyseConversationTurns([
      { role: "assistant", content: "That helps. When do you need it completed?" },
      { role: "user", content: "End of the month" },
      { role: "assistant", content: "That helps. When do you need it completed?" }
    ]);
    expect(result.signals.repeatedAgentQuestion).toBe(true);
    expect(result.signals.repeatedAcknowledgement).toBe(true);
  });

  it("flags a latest client question only when no later agent reply exists", () => {
    const open = analyseConversationTurns([
      { role: "assistant", content: "How can I help?" },
      { role: "user", content: "Can you send me the quotation?" }
    ]);
    expect(open.signals.unansweredClientQuestion).toBe(true);

    const answered = analyseConversationTurns([
      { role: "user", content: "Can you send me the quotation?" },
      { role: "assistant", content: "Yes. I will prepare it from the catalogue." }
    ]);
    expect(answered.signals.unansweredClientQuestion).toBe(false);
  });
});
