import { describe, expect, it } from "vitest";
import { inferConversationAnswerPatch, repairConversationReply } from "@/lib/conversation-continuity";

const assistant = (content: string) => ({ role: "assistant" as const, content });
const user = (content: string) => ({ role: "user" as const, content });
const lead = { programme: null, deadline: null, packageName: null };

describe("cross-service conversation continuity", () => {
  it("captures a natural month-year deadline answer", () => {
    const patch = inferConversationAnswerPatch(
      [assistant("What deadline are you working toward?"), user("January 2027")],
      "January 2027",
      lead
    );
    expect(patch.deadline).toBe("January 2027");
  });

  it("captures a natural programme answer even when it is not a canned academic-level phrase", () => {
    const patch = inferConversationAnswerPatch(
      [assistant("What programme or academic level is this for?"), user("MBA in Finance")],
      "MBA in Finance",
      lead
    );
    expect(patch.programme).toBe("MBA in Finance");
  });

  it("captures a Pa Gym format answer without asking the choice again", () => {
    const patch = inferConversationAnswerPatch(
      [assistant("Do you need theory practice, OSCE preparation, or both?"), user("Both please")],
      "Both please",
      lead
    );
    expect(patch.packageName).toBe("Theory + OSCE");
  });

  it("does not save clarification requests as client facts", () => {
    const patch = inferConversationAnswerPatch(
      [assistant("What deadline are you working toward?"), user("What do you mean?")],
      "What do you mean?",
      lead
    );
    expect(patch.deadline).toBeUndefined();
  });

  it("explains a repeated question when the client asks what it means", () => {
    const reply = repairConversationReply(
      "What deadline are you working toward?",
      "What do you mean?",
      ["What deadline are you working toward?"]
    );
    expect(reply).toMatch(/when you need the work completed or submitted/i);
    expect(reply).not.toBe("What deadline are you working toward?");
  });

  it("does not repeat a question after the client has answered it", () => {
    const reply = repairConversationReply(
      "What deadline are you working toward?",
      "January 2027",
      ["What deadline are you working toward?"]
    );
    expect(reply).toMatch(/noted the timeframe/i);
    expect(reply).not.toMatch(/^What deadline/i);
  });

  it("responds helpfully when the client is unsure instead of looping", () => {
    const reply = repairConversationReply(
      "What deadline are you working toward?",
      "I'm not sure yet",
      ["What deadline are you working toward?"]
    );
    expect(reply).toMatch(/approximate month or timeframe/i);
  });

  it("clarifies after an emoji-only response rather than repeating verbatim", () => {
    const reply = repairConversationReply(
      "What deadline are you working toward?",
      "☝️",
      ["What deadline are you working toward?"]
    );
    expect(reply).toMatch(/By deadline/i);
  });

  it("clarifies a repeated software-scope question in plain language", () => {
    const reply = repairConversationReply(
      "What would you like the system to do for you?",
      "Can you explain?",
      ["What would you like the system to do for you?"]
    );
    expect(reply).toMatch(/specific work or outcome/i);
    expect(reply).not.toBe("What would you like the system to do for you?");
  });

  it("leaves a genuinely new question unchanged", () => {
    const reply = repairConversationReply(
      "Would you like me to prepare the quotation?",
      "January 2027",
      ["What deadline are you working toward?"]
    );
    expect(reply).toBe("Would you like me to prepare the quotation?");
  });
});
