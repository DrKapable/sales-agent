import { describe, expect, it } from "vitest";
import { formatPremiumCaption } from "@/lib/content-caption-style";

describe("premium Facebook caption formatting", () => {
  it("preserves a natural hook without forcing a decorative emoji and adds mobile-friendly spacing", () => {
    const result = formatPremiumCaption(
      "Still unsure what you can recall without your notes? Review common clinical stations. Build a consistent revision routine.",
      { contentType: "MedMinds Prep / exam preparation", objective: "OSCE revision" }
    );
    expect(result.startsWith("Still unsure")).toBe(true);
    expect(result).toContain("\n\n");
  });

  it("upgrades plain bullets without changing their wording", () => {
    const result = formatPremiumCaption("Research support\n- Proposal development\n- Data analysis", { contentType: "Research service promotion" });
    expect(result).toContain("✅ Proposal development");
    expect(result).toContain("✅ Data analysis");
  });

  it("does not alter an intentional emoji already supplied by the writer", () => {
    const result = formatPremiumCaption("📊 Make your analysis easier to follow.", { contentType: "Data analysis" });
    expect(result).toBe("📊 Make your analysis easier to follow.");
  });

  it("limits hashtag blocks to three tags", () => {
    const result = formatPremiumCaption("Useful revision tip.\n#MedMinds #MedicalStudent #Exams #Study #OSCE");
    expect(result.match(/#[A-Za-z0-9_]+/g)).toHaveLength(3);
  });
});
