import { describe, expect, it } from "vitest";
import { MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE } from "../lib/ai/medminds-prep-commercial-knowledge";

describe("Mary MedMinds Prep commercial knowledge", () => {
  it("contains the current Zambia plans", () => {
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("K100 for 30 days");
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("K150 for 30 days");
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("K200 for 30 days");
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("K250 for 60 days");
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("K500 for 90 days");
  });

  it("contains the approved international USD prices", () => {
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("USD 9.99");
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("USD 14.99");
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("USD 19.99");
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("USD 34.99");
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("USD 44.99");
  });

  it("keeps campaign promotions scoped instead of making them public pricing", () => {
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("not the public 90-day price");
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("Do not offer this 7-day giveaway to everyone");
  });

  it("includes the current PLAB 1 pathway", () => {
    expect(MEDMINDS_PREP_COMMERCIAL_KNOWLEDGE).toContain("PLAB 1 / MLA AKT");
  });
});
