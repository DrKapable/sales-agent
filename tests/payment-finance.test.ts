import { describe, expect, it } from "vitest";
import { paymentBreakdown } from "@/lib/payment-finance";

describe("financial payment breakdown", () => {
  it("calculates a remaining balance for a part payment", () => {
    expect(paymentBreakdown(1000, 400)).toEqual({ totalChargedZmw: 1000, amountPaidZmw: 400, balanceZmw: 600 });
  });

  it("returns zero balance when fully paid", () => {
    expect(paymentBreakdown(750, 750).balanceZmw).toBe(0);
  });

  it("rejects an amount paid above the total charge", () => {
    expect(() => paymentBreakdown(500, 600)).toThrow(/cannot be greater/i);
  });
});
