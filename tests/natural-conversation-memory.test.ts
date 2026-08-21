import { describe, expect, it } from "vitest";
import { inferNaturalConversationFacts } from "@/lib/natural-conversation-memory";

const assistant = (content: string) => ({ role: "assistant" as const, content });
const user = (content: string) => ({ role: "user" as const, content });

const emptyLead = { programme: null, deadline: null, packageName: null };

describe("natural conversation memory", () => {
  it("treats Diploma as programme when Mary just asked for academic level", () => {
    const patch = inferNaturalConversationFacts(
      [
        user("I'd like a research proposal"),
        assistant("What programme or academic level are you doing?"),
        user("Diploma")
      ],
      "Diploma",
      emptyLead
    );

    expect(patch.programme).toBe("Diploma");
    expect(patch.deadline).toBeUndefined();
  });

  it("treats 2 weeks as a deadline/timeframe when Mary just asked about timing", () => {
    const patch = inferNaturalConversationFacts(
      [
        user("Diploma"),
        assistant("When do you need the proposal completed?"),
        user("2 weeks")
      ],
      "2 weeks",
      { ...emptyLead, programme: "Diploma" }
    );

    expect(patch.deadline).toBe("2 weeks");
    expect(patch.programme).toBeUndefined();
  });

  it("does not store a duration as a programme even after a programme question", () => {
    const patch = inferNaturalConversationFacts(
      [assistant("What programme or academic level is this for?"), user("2 weeks")],
      "2 weeks",
      emptyLead
    );

    expect(patch.programme).toBeUndefined();
  });

  it("recognises an explicit deadline stated naturally without a preset question", () => {
    const patch = inferNaturalConversationFacts(
      [user("I need help with a proposal")],
      "My deadline is 04 September",
      { ...emptyLead, programme: "Diploma" }
    );

    expect(patch.deadline).toBe("My deadline is 04 September");
  });
});
