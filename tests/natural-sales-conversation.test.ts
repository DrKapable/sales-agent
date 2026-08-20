import { describe, expect, it } from "vitest";
import { inferNaturalConversationFacts, looksLikeNaturalDeadline, looksLikeNaturalProgramme } from "@/lib/natural-conversation-memory";
import { preparedQuotationPriceState } from "@/lib/prepared-quotation";

const assistant = (content: string) => ({ role: "assistant" as const, content });
const user = (content: string) => ({ role: "user" as const, content });
const emptyLead = { programme: null, deadline: null, packageName: null };

describe("natural sales conversation memory", () => {
  it("treats a bare duration as the answer to a deadline question", () => {
    const patch = inferNaturalConversationFacts(
      [assistant("When would you need the proposal completed?"), user("2 weeks")],
      "2 weeks",
      emptyLead
    );
    expect(patch.deadline).toBe("2 weeks");
    expect(patch.programme).toBeUndefined();
  });

  it("never treats a duration as an academic programme", () => {
    expect(looksLikeNaturalProgramme("2 weeks")).toBe(false);
    const patch = inferNaturalConversationFacts(
      [assistant("What programme or level are you studying?"), user("2 weeks")],
      "2 weeks",
      emptyLead
    );
    expect(patch.programme).toBeUndefined();
  });

  it("captures Diploma naturally as an academic level", () => {
    const patch = inferNaturalConversationFacts(
      [assistant("What level are you studying at?"), user("Diploma")],
      "Diploma",
      emptyLead
    );
    expect(patch.programme).toBe("Diploma");
  });

  it("accepts a natural calendar date after a timing question", () => {
    expect(looksLikeNaturalDeadline("04 September", true)).toBe(true);
    const patch = inferNaturalConversationFacts(
      [assistant("When do you need it submitted?"), user("04 September")],
      "04 September",
      emptyLead
    );
    expect(patch.deadline).toBe("04 September");
  });

  it("does not invent CRM facts from a conversational acceptance", () => {
    const patch = inferNaturalConversationFacts(
      [assistant("Would you like me to prepare the quotation?"), user("Yes please")],
      "Yes please",
      emptyLead
    );
    expect(patch).toEqual({});
  });
});

describe("quotation price consistency guard", () => {
  it("reuses the same-service quotation when the approved amount is unchanged", () => {
    expect(preparedQuotationPriceState({ amount_zmw: 900 }, 900)).toBe("same");
  });

  it("requires review instead of silently issuing a different-price quotation", () => {
    expect(preparedQuotationPriceState({ amount_zmw: 800 }, 900)).toBe("different");
  });
});
