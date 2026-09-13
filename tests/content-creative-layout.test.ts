import { describe, expect, it } from "vitest";
import { resolveCreativeLayout } from "@/lib/content-creative-layout";

describe("content-aware creative layouts", () => {
  it("uses FAQ layout for FAQ content", () => {
    expect(resolveCreativeLayout({ contentType: "Student FAQ", title: "Common question" })).toBe("faq");
  });

  it("uses data-oriented layouts for analytics content", () => {
    expect(["data-grid", "split"]).toContain(resolveCreativeLayout({ contentType: "Data analysis", title: "Clean your dataset" }));
  });

  it("varies exam-prep content within approved promotional layouts", () => {
    expect(["split", "spotlight", "cards"]).toContain(resolveCreativeLayout({ contentType: "MedMinds Prep / exam preparation", title: "NMCZ revision" }));
  });

  it("respects a manual layout override", () => {
    expect(resolveCreativeLayout({ contentType: "Data analysis" }, "editorial")).toBe("editorial");
  });
});
