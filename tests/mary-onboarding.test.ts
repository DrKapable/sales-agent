import { describe, expect, it } from "vitest";
import {
  buildApplicantWhatsAppUrl,
  buildMaryOnboardingAlert,
  resolveOnboardingDocumentMime,
  sanitizeOnboardingFilename,
  validateOnboardingDocumentBytes,
  type MaryOnboardingSubmission
} from "../lib/mary-onboarding";

const submission: MaryOnboardingSubmission = {
  id: "559c456e-5167-4fdb-b79c-c25c91895622",
  reference: "MK-20260821-559C45",
  createdAt: "2026-08-21T10:00:00.000Z",
  legalName: "Example Company Limited",
  tradingName: "Example",
  organisationType: "Private limited company",
  registrationNumber: "120260000001",
  tpin: "1000000000",
  town: "Lusaka",
  contactName: "Jane Director",
  contactRole: "Director",
  contactPhone: "260971234567",
  contactEmail: "jane@example.com",
  useCase: "Sales and lead qualification",
  monthlyEnquiries: "100–500",
  documentKind: "Certificate of incorporation",
  fileName: "certificate.pdf",
  mimeType: "application/pdf",
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
};

describe("Mary organisation onboarding", () => {
  it("accepts supported registration document signatures", () => {
    expect(resolveOnboardingDocumentMime("certificate.pdf", "application/pdf")).toBe("application/pdf");
    expect(validateOnboardingDocumentBytes("certificate.pdf", "application/pdf", submission.bytes).valid).toBe(true);
    expect(validateOnboardingDocumentBytes(
      "certificate.png",
      "image/png",
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ).valid).toBe(true);
  });

  it("rejects a misleading extension or invalid signature", () => {
    expect(resolveOnboardingDocumentMime("certificate.exe", "application/pdf")).toBeNull();
    expect(validateOnboardingDocumentBytes(
      "certificate.pdf",
      "application/pdf",
      new TextEncoder().encode("not a pdf")
    ).valid).toBe(false);
  });

  it("sanitises uploaded filenames", () => {
    expect(sanitizeOnboardingFilename("../../Company<> Certificate.pdf")).toBe("Company_ Certificate.pdf");
  });

  it("builds a private-reference WhatsApp handover to Mary's corrected number", () => {
    const url = buildApplicantWhatsAppUrl(submission);
    expect(url).toContain("https://wa.me/260762402042");
    expect(decodeURIComponent(url)).toContain(submission.reference);
    expect(decodeURIComponent(url)).not.toContain(submission.contactEmail);
  });

  it("builds the internal WhatsApp application summary", () => {
    const alert = buildMaryOnboardingAlert(submission);
    expect(alert).toContain("New Mary onboarding application");
    expect(alert).toContain("Example Company Limited");
    expect(alert).toContain("+260971234567");
    expect(alert).toContain("Certificate of incorporation");
  });
});
