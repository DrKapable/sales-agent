import { describe, expect, it } from "vitest";
import { FOLLOW_UP_TEAM, isFollowUpTeamMember } from "@/lib/follow-up-team";

describe("follow-up team", () => {
  it("includes every approved person who may schedule or complete a follow-up", () => {
    expect(FOLLOW_UP_TEAM).toEqual([
      "Dr Kanyembo Ng'andwe",
      "Mr Conrad Mununkha Phiri",
      "Dr Zabibu Nandazi",
      "Dr Mustafa Juma Phiri"
    ]);
  });

  it("accepts approved follow-up owners and rejects arbitrary names", () => {
    expect(isFollowUpTeamMember("Dr Mustafa Juma Phiri")).toBe(true);
    expect(isFollowUpTeamMember("Dr Kanyembo Ng'andwe")).toBe(true);
    expect(isFollowUpTeamMember("Unknown User")).toBe(false);
  });
});
