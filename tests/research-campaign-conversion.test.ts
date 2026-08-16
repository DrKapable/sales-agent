import { describe, expect, it } from "vitest";
import { researchCampaignOpening } from "@/lib/research-campaign-conversion";

describe("research campaign opening", () => {
  it("keeps the common vague ad opener short and prioritizes research support", () => {
    const result = researchCampaignOpening("Hello! Can I get more info on this?", true);
    expect(result).not.toBeNull();
    expect(result?.serviceInterest).toBe("Research enquiry");
    expect(result?.reply).toContain("support you directly");
    expect(result?.reply).toContain("K350 AI-Assisted Proposal Writing course");
    expect(result?.reply.length).toBeLessThan(420);
  });

  it("gives a concise price answer when a first message only asks how much", () => {
    const result = researchCampaignOpening("How much?", true);
    expect(result?.reply).toContain("K350");
    expect(result?.reply).toContain("hands-on research support");
  });

  it("does not hijack enquiries for other MedMinds services", () => {
    expect(researchCampaignOpening("Can I get more info on Pa Gym?", true)).toBeNull();
    expect(researchCampaignOpening("How much is the website package?", true)).toBeNull();
  });

  it("does not replay the campaign opener later in an existing conversation", () => {
    expect(researchCampaignOpening("Can I get more info on this?", false)).toBeNull();
  });
});
