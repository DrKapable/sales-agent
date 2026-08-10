import { describe, expect, it } from "vitest";
import { humanMessageContent, replyWindow } from "../lib/conversation";
import type { ConversationMessage } from "../lib/types";

function message(role: "user" | "assistant", createdAt: string): ConversationMessage {
  return { id: crypto.randomUUID(), externalId: null, phone: "260970000000", role, content: "Hello", createdAt };
}

describe("human conversation controls", () => {
  it("opens the reply window for 24 hours after the latest client message", () => {
    const now = Date.parse("2026-08-10T12:00:00.000Z");
    expect(replyWindow([message("user", "2026-08-09T13:00:00.000Z")], now).open).toBe(true);
    expect(replyWindow([message("user", "2026-08-09T11:00:00.000Z")], now).open).toBe(false);
  });

  it("marks stored staff messages for the conversation history", () => {
    expect(humanMessageContent("Dr Kanyembo Ng'andwe", " I will assist you. ")).toBe("[Human: Dr Kanyembo Ng'andwe] I will assist you.");
  });
});
