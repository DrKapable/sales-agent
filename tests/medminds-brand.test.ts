import { describe, expect, it } from "vitest";
import { assessMedMindsContent, hasLegacyContentDestination, hasLegacyPrepBrand, normalizeMedMindsBranding } from "@/lib/medminds-brand";

describe("MedMinds brand rules", () => {
  it("normalizes the retired prep name without changing legacy URL slugs unless passed as prose", () => {
    expect(normalizeMedMindsBranding("Pa Gym Theory and OSCE")).toBe("MedMinds Prep Theory and OSCE");
    expect(normalizeMedMindsBranding("PAGym revision")).toBe("MedMinds Prep revision");
  });

  it("detects legacy naming before approval", () => {
    expect(hasLegacyPrepBrand("Try Pa Gym today")).toBe(true);
    expect(hasLegacyPrepBrand("Try MedMinds Prep today")).toBe(false);
  });

  it("detects outdated public content destinations", () => {
    expect(hasLegacyContentDestination("Open https://medmindslc.site/nmcz.html")).toBe(true);
    expect(hasLegacyContentDestination("Open https://www.medmindslc.online/affiliate/nmcz?ref=jumamustafap")).toBe(false);
  });

  it("flags retired branding and unsupported guarantees", () => {
    const quality = assessMedMindsContent({
      title: "Pa Gym campaign",
      body: "Guaranteed pass with our exam preparation service."
    });
    expect(quality.blockers).toContain("Replace the retired product name with MedMinds Prep.");
    expect(quality.warnings.some((warning) => warning.includes("unsupported guarantee"))).toBe(true);
  });

  it("blocks legacy Prep links and old 24-hour trial wording", () => {
    const quality = assessMedMindsContent({
      title: "MedMinds Prep NMCZ",
      contentType: "MedMinds Prep / exam preparation",
      body: "Start your 24-hour free trial at https://medmindslc.site/pa-gym-start.html?ref=jumamustafap"
    });
    expect(quality.blockers.some((item) => item.includes("outdated MedMinds link"))).toBe(true);
    expect(quality.blockers.some((item) => item.includes("2-day free trial"))).toBe(true);
  });

  it("blocks em dashes and obvious AI-marketing phrases before approval", () => {
    const quality = assessMedMindsContent({
      title: "Revision support",
      body: "Elevate your revision — unlock your potential with focused practice and clear feedback."
    });
    expect(quality.blockers.some((item) => item.includes("em dashes"))).toBe(true);
    expect(quality.blockers.some((item) => item.includes("AI-like marketing wording"))).toBe(true);
    expect(quality.checks.find((check) => check.label === "Natural, non-formulaic wording")?.ok).toBe(false);
  });

  it("warns when the caption repeats the creative title or opens generically", () => {
    const quality = assessMedMindsContent({
      title: "Good exam revision is more than reading notes repeatedly",
      contentType: "MedMinds Prep / exam preparation",
      body: "Good exam revision is more than reading notes repeatedly.\n\nExplore the platform to learn more.",
      cta: "try"
    });
    expect(quality.warnings.some((item) => item.includes("Strengthen the opening"))).toBe(true);
    expect(quality.warnings.some((item) => item.includes("repeats the working/creative title"))).toBe(true);
    expect(quality.warnings.some((item) => item.includes("more direct call to action"))).toBe(true);
  });

  it("requires verification for numerical or popularity-style proof language", () => {
    const quality = assessMedMindsContent({
      title: "Exam practice",
      contentType: "MedMinds Prep / exam preparation",
      body: "Still unsure whether you are ready? Join hundreds of students using MedMinds Prep before your next exam."
    });
    expect(quality.warnings.some((item) => item.includes("Verify any student count"))).toBe(true);
  });
});
