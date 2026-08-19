import { describe, expect, it } from "vitest";
import { inferResearchCatalogueService, inferResearchDeadline, isExplicitResearchHumanRequest, researchSalesHasCommercialIntent } from "@/lib/research-sales-flow";

describe("research sales conversion-first flow", () => {
  it("keeps the screenshot scenario on the research-proposal sales path", () => {
    const transcript = [
      "Good afternoon, how much do you charge for the training?",
      "Help with actual proposal"
    ].join("\n");

    expect(inferResearchCatalogueService(transcript, "Research support")).toBe("Research Proposal");
    expect(researchSalesHasCommercialIntent(transcript)).toBe(true);
  });

  it("maps common hands-on research deliverables to catalogue-safe names", () => {
    expect(inferResearchCatalogueService("I need help with my dissertation", "Research support")).toBe("Dissertation or Thesis");
    expect(inferResearchCatalogueService("Please help with qualitative data analysis", "Research support")).toBe("Qualitative Analysis");
    expect(inferResearchCatalogueService("I need a questionnaire for data collection", "Research support")).toBe("Data Collection Tool");
  });

  it("recognises explicit requests for a human or specialist as exceptions", () => {
    expect(isExplicitResearchHumanRequest("Can I speak to Dr Monica about my proposal?" )).toBe(true);
    expect(isExplicitResearchHumanRequest("Please connect me to a research specialist")).toBe(true);
    expect(isExplicitResearchHumanRequest("Help with my actual proposal")).toBe(false);
  });

  it("accepts month-and-year deadlines instead of repeating the deadline question", () => {
    expect(inferResearchDeadline(["The deadline is January 2027"])).toBe("January 2027");
    expect(inferResearchDeadline(["I need it by Jan 2027"])).toBe("Jan 2027");
    expect(inferResearchDeadline(["Submission is 30 January 2027"])).toBe("30 January 2027");
    expect(inferResearchDeadline(["The deadline is January 2027"], "15 February 2027")).toBe("15 February 2027");
  });
});
