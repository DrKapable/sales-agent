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
  source: "whatsapp",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z"
};

describe("referral notifications", () => {
  it("routes payment and discount matters to Mustafa", () => {
    expect(recipientForReferral("payment").phone).toBe("260977259132");
    expect(recipientForReferral("discount").phone).toBe("260977259132");
  });

  it("routes other enquiries to Kanyembo", () => {
    expect(recipientForReferral("general").phone).toBe("260974634555");
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
