import { describe, expect, it } from "vitest";
import { matchingRegisteredStaff, staffMessagePreview } from "@/lib/internal-team-actions";
import type { TeamMember } from "@/lib/internal-team-registry";

function staff(name: string, phone: string, role: TeamMember["role"], active = true): TeamMember {
  return { id: name, name, phone, role, active, dailyBriefEnabled: true, priorityAlertsEnabled: true };
}
const people: TeamMember[] = [
  staff("Dr. Mustafa Juma Phiri", "260977259132", "director"),
  staff("Dr Kanyembo Ng'andwe", "260974634555", "sales"),
  staff("Mr Conrad Mununkha Phiri", "260979235018", "marketing"),
  staff("Dr Zabibu Nandazi", "260975352801", "support")
];

describe("Mary's registered team recipient resolution", () => {
  it.each(["Kanyembo", "Dr Kanyembo", "Dr. Kanyembo", "Ng'andwe", "Dr Kanyembo Ng'andwe", "260974634555", "+260 974 634 555"])(
    "recognises the configured sales colleague from %s",
    (name) => expect(matchingRegisteredStaff(people, name).map(p => p.name)).toEqual(["Dr Kanyembo Ng'andwe"])
  );
  it.each(["Conrad","Mr Conrad","Mununkha","Zabibu","Juma"])(
    "resolves a unique everyday name %s without asking for a phone number",
    (name) => expect(matchingRegisteredStaff(people, name)).toHaveLength(1)
  );
  it("rejects a family name shared by multiple members", () => {
    expect(matchingRegisteredStaff(people,"Phiri")).toHaveLength(2);
  });
  it("does not resolve partial phone numbers or generic titles", () => {
    expect(matchingRegisteredStaff(people,"634555")).toHaveLength(0);
    expect(matchingRegisteredStaff(people,"Dr")).toHaveLength(0);
    expect(matchingRegisteredStaff(people,"97463455")).toHaveLength(0);
  });
  it("never includes revoked staff and does not substitute their numbers", () => {
    const disabled=people.map(p=>({...p,active:p.role!=="sales"}));
    expect(matchingRegisteredStaff(disabled,"Kanyembo")).toHaveLength(0);
    expect(matchingRegisteredStaff(disabled,"260974634555")).toHaveLength(0);
  });
});

describe("preview before forwarding a team reminder", () => {
  it("shows the complete proposed body and the exact recipient", () => {
    const message="Please address the outstanding issue in the MedMinds inbox. Dr. Juma asked me to follow up with you. Kindly update the team when it is resolved.";
    const draft=staffMessagePreview("Dr. Mustafa Juma Phiri","Dr Kanyembo Ng'andwe",message);
    expect(draft).toContain("*Recipient:* Dr Kanyembo Ng'andwe");
    expect(draft).toContain("*Full proposed WhatsApp message:*");
    expect(draft).toContain("Message from Dr. Mustafa Juma Phiri via Mary Kaunda");
    expect(draft).toContain("For: Dr Kanyembo Ng\'andwe");
    expect(draft).toContain(message);
    expect(draft).not.toContain("Message submitted");
  });
});
