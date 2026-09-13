import { describe, expect, it } from "vitest";
import {
  CURRENT_CONTENT_DESTINATIONS,
  ensureDestinationInCaption,
  removeLegacyMedMindsUrls,
  selectContentDestination
} from "@/lib/content-destinations";

describe("MedMinds content destinations", () => {
  it("routes NMCZ content to the current NMCZ affiliate landing page", () => {
    const destination = selectContentDestination({ objective: "Promote NMCZ competence examination practice for nurses" });
    expect(destination?.url).toBe("https://www.medmindslc.online/affiliate/nmcz?ref=jumamustafap");
  });

  it("routes preclinical content to the current preclinical affiliate landing page", () => {
    const destination = selectContentDestination({ objective: "Foundational medical sciences and preclinical QBank practice" });
    expect(destination?.url).toBe("https://www.medmindslc.online/affiliate/preclinical?ref=jumamustafap");
  });

  it("routes undergraduate QBank/OSCE content to the medical-students page", () => {
    const destination = selectContentDestination({ objective: "Medical student QBank, Past Papers Theory and OSCE Clinical Skills" });
    expect(destination?.url).toBe("https://www.medmindslc.online/affiliate/medical-students?ref=jumamustafap");
  });

  it("routes STP/MMed Internal Medicine content to the postgraduate page", () => {
    const destination = selectContentDestination({ objective: "STP/MMed Internal Medicine revision and OSCE preparation" });
    expect(destination?.url).toBe("https://www.medmindslc.online/affiliate/pg-internal-medicine?ref=jumamustafap");
  });

  it("removes legacy Prep URLs and appends the authoritative destination", () => {
    const old = "Start here: https://medmindslc.site/pa-gym-start.html?ref=jumamustafap";
    const cleaned = removeLegacyMedMindsUrls(old);
    expect(cleaned).not.toContain("medmindslc.site");
    const updated = ensureDestinationInCaption(cleaned, CURRENT_CONTENT_DESTINATIONS["prep-medical-students"]);
    expect(updated).toContain("2-day free trial");
    expect(updated).toContain("/affiliate/medical-students?ref=jumamustafap");
  });

  it("uses research and ZaTafa destinations for their matching content", () => {
    expect(selectContentDestination({ contentType: "Research service promotion", objective: "Dissertation support" })?.url)
      .toBe("https://www.medmindslc.online/research-portal");
    expect(selectContentDestination({ objective: "Show the ZaTafa MedStats analysis workflow" })?.url)
      .toBe("https://www.medmindslc.online/zatafa-medstats");
  });
});
