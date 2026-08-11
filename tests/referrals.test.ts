import { describe, expect, it } from "vitest";
import { buildReferralMessage, recipientForReferral } from "../lib/referrals";
import type { Lead } from "../lib/types";

const lead: Lead = {
  id: "lead-1",
  phone: "260970000000",
  name: "Amina Banda",
  email: null,
  institution: "UNZA",
  programme: "MPH",
  serviceInterest: "Research proposal",
  deadline: "14 days",
  packageName: null,
  status: "HUMAN ASSISTANCE REQUIRED",
  handoffReason: "Discount request",
  aiPaused: true,
  assignedTo: "Dr. Mustafa Juma Phiri",
  internalNote: null,
  priority: "STANDARD",
  followUpAt: null,
  source: "whatsapp",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z"
};

describe("referral notifications", () => {
  it("routes payment, senior research and business automation to Dr Mustafa", () => {
    expect(recipientForReferral("payment").name).toBe("Dr. Mustafa Juma Phiri");
    expect(recipientForReferral("research_specialist").name).toBe("Dr. Mustafa Juma Phiri");
    expect(recipientForReferral("business_automation").name).toBe("Dr. Mustafa Juma Phiri");
  });

  it("routes sales escalation to Dr Kanyembo", () => {
    expect(recipientForReferral("sales").name).toBe("Dr Kanyembo Ng'andwe");
  });

  it("routes routine research support to Mr. Madalitso Masumbu", () => {
    expect(recipientForReferral("research").name).toBe("Mr. Madalitso Masumbu");
    expect(recipientForReferral("research").phone).toBe("260979104893");
  });

  it("routes legal disputes to Counsel Chisha Chomba", () => {
    expect(recipientForReferral("legal").name).toBe("Counsel Chisha Chomba");
    expect(recipientForReferral("dispute").name).toBe("Counsel Chisha Chomba");
  });

  it("routes cybersecurity to Ms Kabosha Kayonga", () => {
    expect(recipientForReferral("cybersecurity").name).toBe("Ms Kabosha Kayonga");
  });

  it("honours an explicitly requested staff member", () => {
    expect(recipientForReferral("general", "Client asked for Counsel Chisha Chomba").name).toBe("Counsel Chisha Chomba");
    expect(recipientForReferral("general", "Please connect me with Dr Mustafa").name).toBe("Dr. Mustafa Juma Phiri");
    expect(recipientForReferral("general", "Please connect me with Madalitso Masumbu").name).toBe("Mr. Madalitso Masumbu");
  });

  it("includes client identity, contact and case summary", () => {
    const message = buildReferralMessage({
      recipientName: "Dr. Mustafa Juma Phiri",
      lead,
      reason: "Discount request",
      summary: "Client requests a discount for a research proposal required in 14 days."
    });
    expect(message).toContain("Client name: Amina Banda");
    expect(message).toContain("Client contact: +260970000000");
    expect(message).toContain("Service: Research proposal");
    expect(message).toContain("Summary: Client requests a discount");
    expect(message).not.toContain("—");
  });
});
