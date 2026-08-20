import { describe, expect, it } from "vitest";
import { MEDMINDS_BUSINESS_IDENTITY } from "@/lib/business-identity";
import { createCommercialPdf } from "@/lib/commercial-pdf";
import { createBrandedReceiptPdf } from "@/lib/receipt-pdf";

describe("official MedMinds documents", () => {
  it("keeps the registered legal identity and TPIN in the generated commercial PDF", () => {
    const pdf = createCommercialPdf({ kind: "invoice", documentNumber: "INV-TEST", clientName: "Client", service: "Research Proposal", amountZmw: 1000, totalChargedZmw: 1000, amountPaidZmw: 400, balanceZmw: 600, details: "Test invoice" });
    const raw = Buffer.from(pdf).toString("latin1");
    expect(raw).toContain(MEDMINDS_BUSINESS_IDENTITY.legalName);
    expect(raw).toContain(`TPIN: ${MEDMINDS_BUSINESS_IDENTITY.tpin}`);
    expect(raw).toContain("TOTAL CHARGED");
    expect(raw).toContain("AMOUNT PAID");
    expect(raw).toContain("BALANCE");
  });

  it("shows tax identity and balance information on receipts", () => {
    const pdf = createBrandedReceiptPdf({ receiptNumber: "MM-TEST", clientName: "Client", service: "Research Proposal", amountZmw: 400, totalChargedZmw: 1000, balanceZmw: 600 });
    const raw = Buffer.from(pdf).toString("latin1");
    expect(raw).toContain(MEDMINDS_BUSINESS_IDENTITY.legalName);
    expect(raw).toContain(`TPIN: ${MEDMINDS_BUSINESS_IDENTITY.tpin}`);
    expect(raw).toContain("PART PAYMENT");
    expect(raw).toContain("BALANCE");
  });
});
