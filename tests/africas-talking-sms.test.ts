import { describe, expect, it } from "vitest";
import { normalizeSmsPhone } from "@/lib/africas-talking-sms";

describe("Africa's Talking SMS phone normalisation", () => {
  it("normalises common Zambian mobile formats", () => {
    expect(normalizeSmsPhone("0977259132")).toBe("+260977259132");
    expect(normalizeSmsPhone("260977259132")).toBe("+260977259132");
    expect(normalizeSmsPhone("+260 977 259 132")).toBe("+260977259132");
  });

  it("rejects invalid phone numbers", () => {
    expect(normalizeSmsPhone("123")).toBeNull();
  });
});
