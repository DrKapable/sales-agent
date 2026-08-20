import { describe, expect, it } from "vitest";
import {
  inferResearchCatalogueService,
  inferResearchDeadline,
  inferResearchProgramme,
  isExplicitResearchHumanRequest,
  researchQualificationQuestion,
  researchSalesHasCommercialIntent
} from "@/lib/research-sales-flow";

describe("research sales conversion-first flow", () => {
  it("keeps the screenshot scenario on the research-proposal sales path", () => {
    const transcript = [
      "Good afternoon, how much do you charge for the training?",
      "Help with actual proposal"
    ].join("\n");

    expect(inferResearchCatalogueService(transcript, "Research support")).toBe("Research Proposal");
    expect(researchSalesHasCommercialIntent(transcript)).toBe(true);
  });

  it("does not downgrade an established proposal to topic development from casual topic wording", () => {
    const transcript = [
      "Proposal",
      "How much is it to do everything for me on my research topic"
    ].join("\n");
    expect(inferResearchCatalogueService(transcript, "Research Proposal")).toBe("Research Proposal");
  });

  it("still recognises an explicit request for topic development", () => {
    expect(inferResearchCatalogueService("Please help me develop a research topic", "Research support")).toBe("Research Topic Development");
  });

  it("maps common hands-on research deliverables to catalogue-safe names", () => {
    expect(inferResearchCatalogueService("I need help with my dissertation", "Research support")).toBe("Dissertation or Thesis");
    expect(inferResearchCatalogueService("Please help with qualitative data analysis", "Research support")).toBe("Qualitative Analysis");
    expect(inferResearchCatalogueService("I need a questionnaire for data collection", "Research support")).toBe("Data Collection Tool");
  });

  it("lets the latest client clarification replace an older or stored research service", () => {
    const transcript = [
      "I was asking about proposal support",
      "Actually I need help with my dissertation"
    ].join("\n");

    expect(inferResearchCatalogueService(transcript, "Research Proposal")).toBe("Dissertation or Thesis");
    expect(inferResearchCatalogueService("Dissertation", "Research Proposal")).toBe("Dissertation or Thesis");
  });

  it("repairs a bogus stored programme when the client later gives the real level", () => {
    expect(inferResearchProgramme(
      ["Proposal", "How much is it to do everything for me on my research topic", "Bachelors"],
      "How much is it to do everything for me on my research topic"
    )).toBe("Undergraduate/Bachelor's");
  });

  it("uses the identified deliverable in the qualification question", () => {
    const question = researchQualificationQuestion("Dissertation or Thesis", null, null);
    expect(question).toContain("dissertation/thesis service and fee");
    expect(question).not.toContain("proposal service");
  });

  it("recognises explicit requests for a human or specialist as exceptions", () => {
    expect(isExplicitResearchHumanRequest("Can I speak to Dr Monica about my proposal?" )).toBe(true);
    expect(isExplicitResearchHumanRequest("Please connect me to a research specialist")).toBe(true);
    expect(isExplicitResearchHumanRequest("Help with my actual proposal")).toBe(false);
  });

  it("accepts month-and-year and month-day deadlines instead of repeating the deadline question", () => {
    expect(inferResearchDeadline(["The deadline is January 2027"])).toBe("January 2027");
    expect(inferResearchDeadline(["I need it by Jan 2027"])).toBe("Jan 2027");
    expect(inferResearchDeadline(["Submission is 30 January 2027"])).toBe("30 January 2027");
    expect(inferResearchDeadline(["November 5"])).toBe("November 5");
  });

  it("lets an explicit latest deadline clarification replace an older stored deadline", () => {
    expect(inferResearchDeadline(["The deadline is January 2027"], "15 February 2027")).toBe("January 2027");
  });
});
