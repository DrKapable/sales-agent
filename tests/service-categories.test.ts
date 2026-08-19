import { describe, expect, it } from "vitest";
import { harmonizeServiceCategory, SERVICE_CATEGORY_ORDER, summarizeServiceCategories } from "@/lib/service-categories";

describe("Business Intelligence service harmonization", () => {
  it("uses the five approved management categories in the requested order", () => {
    expect(SERVICE_CATEGORY_ORDER).toEqual([
      "Research Support Services",
      "Online Courses",
      "Pa Gym Services",
      "Software, AI & Automation",
      "Others"
    ]);
  });

  it("maps research work without misclassifying AI-detection work as software", () => {
    expect(harmonizeServiceCategory("Research support")).toBe("Research Support Services");
    expect(harmonizeServiceCategory("Master's Research Proposal")).toBe("Research Support Services");
    expect(harmonizeServiceCategory("Quantitative data analysis")).toBe("Research Support Services");
    expect(harmonizeServiceCategory("AI Detection Report")).toBe("Research Support Services");
    expect(harmonizeServiceCategory("Supervisor corrections")).toBe("Research Support Services");
  });

  it("maps courses, Pa Gym and digital solutions into their management categories", () => {
    expect(harmonizeServiceCategory("Learn Data Analysis course")).toBe("Online Courses");
    expect(harmonizeServiceCategory("Master ECG Interpretation")).toBe("Online Courses");
    expect(harmonizeServiceCategory("Pa Gym Theory and OSCE")).toBe("Pa Gym Services");
    expect(harmonizeServiceCategory("WhatsApp agency automation")).toBe("Software, AI & Automation");
    expect(harmonizeServiceCategory("ZaTafa MedStats")).toBe("Software, AI & Automation");
    expect(harmonizeServiceCategory("PowerPoint presentation")).toBe("Others");
  });

  it("uses catalogue metadata for products whose names are otherwise ambiguous", () => {
    const offers = [
      { slug: "course-ai-research-writing", name: "AI-Assisted Research Proposal Writing", category: "Courses" },
      { slug: "ai-detection-check", name: "AI Detection Report", category: "Plagiarism and AI" }
    ];
    expect(harmonizeServiceCategory("AI-Assisted Research Proposal Writing", offers)).toBe("Online Courses");
    expect(harmonizeServiceCategory("AI Detection Report", offers)).toBe("Research Support Services");
  });

  it("aggregates leads and conversion into exactly five service rows", () => {
    const rows = summarizeServiceCategories([
      { serviceInterest: "Research Proposal", status: "CONVERTED" },
      { serviceInterest: "Qualitative Analysis", status: "INTERESTED" },
      { serviceInterest: "Master ECG course", status: "CONVERTED" },
      { serviceInterest: "Pa Gym OSCE", status: "NEW LEAD" },
      { serviceInterest: "Custom software development", status: "CONVERTED" },
      { serviceInterest: "PowerPoint presentation", status: "NEW LEAD" }
    ]);

    expect(rows).toHaveLength(5);
    expect(rows.find((row) => row.service === "Research Support Services")).toMatchObject({ leads: 2, converted: 1, conversionRate: 50 });
    expect(rows.find((row) => row.service === "Online Courses")).toMatchObject({ leads: 1, converted: 1, conversionRate: 100 });
    expect(rows.find((row) => row.service === "Pa Gym Services")).toMatchObject({ leads: 1, converted: 0, conversionRate: 0 });
    expect(rows.find((row) => row.service === "Software, AI & Automation")).toMatchObject({ leads: 1, converted: 1, conversionRate: 100 });
    expect(rows.find((row) => row.service === "Others")).toMatchObject({ leads: 1, converted: 0, conversionRate: 0 });
  });
});
