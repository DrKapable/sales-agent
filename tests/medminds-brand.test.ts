import { describe, expect, it } from "vitest";
import { assessMedMindsContent, hasLegacyPrepBrand, normalizeMedMindsBranding } from "@/lib/medminds-brand";

describe("MedMinds brand rules", () => {
  it("normalizes the retired prep name without changing legacy URL slugs unless passed as prose", () => {
    expect(normalizeMedMindsBranding("Pa Gym Theory and OSCE")).toBe("MedMinds Prep Theory and OSCE");
    expect(normalizeMedMindsBranding("PAGym revision")).toBe("MedMinds Prep revision");
  });

  it("detects legacy naming before approval", () => {
    expect(hasLegacyPrepBrand("Try Pa Gym today")).toBe(true);
    expect(hasLegacyPrepBrand("Try MedMinds Prep today")).toBe(false);
  });

  it("flags retired branding and unsupported guarantees", () => {
    const quality = assessMedMindsContent({
      title: "Pa Gym campaign",
      body: "Guaranteed pass with our exam preparation service."
    });
    expect(quality.blockers).toContain("Replace the retired product name with MedMinds Prep.");
    expect(quality.warnings.some((warning) => warning.includes("unsupported guarantee"))).toBe(true);
  });
});
