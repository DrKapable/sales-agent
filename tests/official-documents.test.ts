import { describe, expect, it } from "vitest";
import { MEDMINDS_BUSINESS_IDENTITY } from "@/lib/business-identity";
import { commercialDocumentNumber, isInvoiceStatus } from "@/lib/commercial-document";
import { createCommercialPdf } from "@/lib/commercial-pdf";
import { createBrandedReceiptPdf } from "@/lib/receipt-pdf";

describe("official MedMinds documents", () => {
  it("keeps the registered legal identity, TPIN and address in the generated commercial PDF", () => {
    const pdf = createCommercialPdf({ kind: "invoice", documentNumber: "INV-TEST", clientName: "Client", service: "Research Proposal", amountZmw: 1000, totalChargedZmw: 1000, amountPaidZmw: 400, balanceZmw: 600, details: "Test invoice" });
    const raw = Buffer.from(pdf).toString("latin1");
    expect(raw).toContain(MEDMINDS_BUSINESS_IDENTITY.legalName);
    expect(raw).toContain(`TPIN: ${MEDMINDS_BUSINESS_IDENTITY.tpin}`);
    expect(raw).toContain(MEDMINDS_BUSINESS_IDENTITY.physicalAddress);
    expect(raw).toContain("TOTAL CHARGED");
    expect(raw).toContain("AMOUNT PAID");
    expect(raw).toContain("BALANCE");
  });

  it("shows tax identity and balance information on receipts", () => {
    const pdf = createBrandedReceiptPdf({ receiptNumber: "MM-TEST", clientName: "Client", service: "Research Proposal", amountZmw: 400, totalChargedZmw: 1000, balanceZmw: 600 });
    const raw = Buffer.from(pdf).toString("latin1");
    expect(raw).toContain(MEDMINDS_BUSINESS_IDENTITY.legalName);
    expect(raw).toContain(`TPIN: ${MEDMINDS_BUSINESS_IDENTITY.tpin}`);
    expect(raw).toContain(MEDMINDS_BUSINESS_IDENTITY.physicalAddress);
    expect(raw).toContain("PART PAYMENT");
    expect(raw).toContain("BALANCE");
  });

  it("keeps a settled invoice as an invoice and marks it paid in full", () => {
    const record = { id: "12345678-1234-1234-1234-123456789012", service: "Research Proposal", amount_zmw: 1000, total_charged_zmw: 1000, amount_paid_zmw: 1000, balance_zmw: 0, details: "Paid", status: "INVOICE_PAID" };
    expect(isInvoiceStatus(record.status)).toBe(true);
    expect(commercialDocumentNumber(record)).toMatch(/^INV-/);
    const raw = Buffer.from(createCommercialPdf({ kind: "invoice", documentNumber: commercialDocumentNumber(record), clientName: "Client", service: record.service, amountZmw: 1000, totalChargedZmw: 1000, amountPaidZmw: 1000, balanceZmw: 0, details: "Paid" })).toString("latin1");
    expect(raw).toContain("PAID IN FULL");
  });
});
