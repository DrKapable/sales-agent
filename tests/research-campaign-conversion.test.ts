import { describe, expect, it } from "vitest";
import { researchCampaignOpening } from "@/lib/research-campaign-conversion";

describe("research campaign opening", () => {
  it("keeps the common vague ad opener short and asks one qualifying question", () => {
    const result = researchCampaignOpening("Hello! Can I get more info on this?", true);
    expect(result).not.toBeNull();
    expect(result?.serviceInterest).toBe("Research enquiry");
    expect(result?.reply).toContain("support your actual research work");
    expect(result?.reply).not.toMatch(/K\s?\d|ZMW\s?\d/i);
    expect((result?.reply.match(/\?/g) || []).length).toBe(1);
    expect(result?.reply.length).toBeLessThan(420);
  });

  it("does not expose a price when the first message only asks how much", () => {
    const result = researchCampaignOpening("How much?", true);
    expect(result?.reply).not.toMatch(/K\s?\d|ZMW\s?\d/i);
    expect(result?.reply).toContain("which option fits you");
    expect((result?.reply.match(/\?/g) || []).length).toBe(1);
  });

  it("does not hijack enquiries for other MedMinds services", () => {
    expect(researchCampaignOpening("Can I get more info on Pa Gym?", true)).toBeNull();
    expect(researchCampaignOpening("How much is the website package?", true)).toBeNull();
  });

  it("does not replay the campaign opener later in an existing conversation", () => {
    expect(researchCampaignOpening("Can I get more info on this?", false)).toBeNull();
  });
});
