import { describe, expect, it } from "vitest";
import { formatPremiumCaption } from "@/lib/content-caption-style";

describe("premium Facebook caption formatting", () => {
  it("adds a relevant visual anchor and preserves mobile-friendly spacing", () => {
    const result = formatPremiumCaption(
      "Prepare for your OSCE with focused practice. Review common clinical stations. Build a consistent revision routine.",
      { contentType: "MedMinds Prep / exam preparation", objective: "OSCE revision" }
    );
    expect(result.startsWith("🎯 ")).toBe(true);
    expect(result).toContain("\n\n");
  });

  it("upgrades plain bullets without changing their wording", () => {
    const result = formatPremiumCaption("Research support\n- Proposal development\n- Data analysis", { contentType: "Research service promotion" });
    expect(result).toContain("✅ Proposal development");
    expect(result).toContain("✅ Data analysis");
  });

  it("does not add a second emoji when the hook already has one", () => {
    const result = formatPremiumCaption("📊 Make your analysis easier to follow.", { contentType: "Data analysis" });
    expect(result).toBe("📊 Make your analysis easier to follow.");
  });
});
