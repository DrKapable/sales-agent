import { describe, expect, it } from "vitest";
import { isResearchServiceRequest } from "../lib/research-service-escalation";

describe("research sales versus fulfilment boundary", () => {
  it("escalates requests for Mary to personally perform research work", () => {
    expect(isResearchServiceRequest("Can you develop a research topic for me?")).toBe(true);
    expect(isResearchServiceRequest("I need help writing my dissertation proposal")).toBe(true);
    expect(isResearchServiceRequest("Can you help with my methodology and sample size?")).toBe(true);
    expect(isResearchServiceRequest("Please analyse my data and write chapter four")).toBe(true);
  });

  it("keeps research sales, pricing and commercial workflow with Mary", () => {
    expect(isResearchServiceRequest("How much do you charge for data analysis?")).toBe(false);
    expect(isResearchServiceRequest("I need research support for my literature review")).toBe(false);
    expect(isResearchServiceRequest("Can I get a quotation for a research proposal service?")).toBe(false);
    expect(isResearchServiceRequest("I want to proceed with dissertation support")).toBe(false);
    expect(isResearchServiceRequest("Can you send me an invoice for the research service?")).toBe(false);
  });

  it("keeps course and training enquiries with Mary", () => {
    expect(isResearchServiceRequest("Can I get more information about the research proposal writing course?")).toBe(false);
    expect(isResearchServiceRequest("How much is the AI-assisted research proposal writing course?")).toBe(false);
    expect(isResearchServiceRequest("Do I get a certificate after the course?")).toBe(false);
  });

  it("does not escalate ordinary non-research questions", () => {
    expect(isResearchServiceRequest("How much is Pa Gym theory and OSCE?")).toBe(false);
    expect(isResearchServiceRequest("Where are you located?")).toBe(false);
    expect(isResearchServiceRequest("Hello Mary")).toBe(false);
  });
});
