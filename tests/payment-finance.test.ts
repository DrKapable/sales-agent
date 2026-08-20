import { describe, expect, it } from "vitest";
import { cumulativePaymentBreakdown, paymentBreakdown } from "@/lib/payment-finance";

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

  it("accumulates verified instalments against one total charge", () => {
    expect(cumulativePaymentBreakdown(1000, 400, 300)).toEqual({
      totalChargedZmw: 1000,
      amountPaidZmw: 300,
      previousPaidZmw: 400,
      cumulativePaidZmw: 700,
      balanceZmw: 300
    });
  });

  it("settles the balance when the final instalment is verified", () => {
    expect(cumulativePaymentBreakdown(1000, 700, 300).balanceZmw).toBe(0);
  });

  it("prevents cumulative instalments from exceeding the charge", () => {
    expect(() => cumulativePaymentBreakdown(1000, 800, 250)).toThrow(/remaining balance/i);
  });
});
