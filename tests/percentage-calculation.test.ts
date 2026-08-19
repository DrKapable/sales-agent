import { describe, expect, it } from "vitest";
import { precisePercentage, summarizeServiceCategories } from "@/lib/service-categories";

describe("Business percentage calculations", () => {
  it("keeps enquiry share separate from service conversion rate", () => {
    const leads = [
      ...Array.from({ length: 14 }, (_, index) => ({ serviceInterest: "Research support", status: index < 2 ? "CONVERTED" : "QUALIFIED" })),
      ...Array.from({ length: 9 }, () => ({ serviceInterest: "AI-Assisted Research Proposal Writing", status: "QUALIFIED" })),
      ...Array.from({ length: 32 }, () => ({ serviceInterest: "PowerPoint presentation", status: "NEW LEAD" }))
    ];

    const rows = summarizeServiceCategories(leads, [
      { slug: "course-ai-research-writing", name: "AI-Assisted Research Proposal Writing", category: "Courses" }
    ]);
    const research = rows.find((row) => row.service === "Research Support Services");
    const courses = rows.find((row) => row.service === "Online Courses");
    const others = rows.find((row) => row.service === "Others");

    expect(research).toMatchObject({ leads: 14, converted: 2, leadShare: 25.5, conversionRate: 14.3 });
    expect(courses).toMatchObject({ leads: 9, converted: 0, leadShare: 16.4, conversionRate: 0 });
    expect(others).toMatchObject({ leads: 32, converted: 0, leadShare: 58.2, conversionRate: 0 });
  });

  it("uses one-decimal precision instead of rounding all percentages to whole numbers", () => {
    expect(precisePercentage(2, 55)).toBe(3.6);
    expect(precisePercentage(2, 14)).toBe(14.3);
    expect(precisePercentage(0, 0)).toBe(0);
  });
});
