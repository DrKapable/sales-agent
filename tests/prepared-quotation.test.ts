import { describe, expect, it } from "vitest";
import { preparedQuotationPriceState } from "@/lib/prepared-quotation";

describe("prepared quotation consistency", () => {
  it("reuses an active same-service quotation when the approved amount is unchanged", () => {
    expect(preparedQuotationPriceState({ amount_zmw: 900 }, 900)).toBe("same");
    expect(preparedQuotationPriceState({ amount_zmw: "900" as unknown as number }, 900)).toBe("same");
  });

  it("requires review instead of silently issuing a conflicting price", () => {
    expect(preparedQuotationPriceState({ amount_zmw: 900 }, 1200)).toBe("different");
    expect(preparedQuotationPriceState({ amount_zmw: null }, 900)).toBe("different");
  });

  it("recognises when no previous active quotation exists", () => {
    expect(preparedQuotationPriceState(null, 900)).toBe("none");
  });
});
