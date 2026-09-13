import { describe, expect, it } from "vitest";
import { findAiStyleSignals, humanizeGeneratedText } from "@/lib/content-human-style";

describe("human social copy rules", () => {
  it("removes em and en dashes from generated text", () => {
    const result = humanizeGeneratedText("Focused revision — without the clutter – for medical students.");
    expect(result).not.toContain("—");
    expect(result).not.toContain("–");
    expect(result).toContain("-");
  });

  it("rewrites common AI marketing phrases", () => {
    const result = humanizeGeneratedText("In today's fast-paced world, unlock your potential and leverage focused practice to take your revision to the next level.");
    expect(result.toLowerCase()).not.toContain("fast-paced world");
    expect(result.toLowerCase()).not.toContain("unlock your potential");
    expect(result.toLowerCase()).not.toContain("leverage");
    expect(result.toLowerCase()).not.toContain("next level");
  });

  it("detects AI-like wording for the approval quality gate", () => {
    const signals = findAiStyleSignals("Elevate your revision — your journey starts here.");
    expect(signals).toContain("em/en dash punctuation");
    expect(signals.some((signal) => signal.includes("elevate"))).toBe(true);
    expect(signals.some((signal) => signal.includes("journey"))).toBe(true);
  });
});
