import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { MEDMINDS_BANK, commercialPaymentAmount } from "@/lib/medminds-payment-policy";
import { buildCommercialPdf } from "@/lib/commercial-document";
import { createResearchPaymentRequest } from "@/lib/research-payments";

describe("open quotation payments", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("keeps the 50% task deposit separate from the full quotation and invoice balance", () => {
    expect(commercialPaymentAmount({ service: "EMKP application support", status: "QUOTATION", amount_zmw: 6500 })).toBe(3250);
    expect(commercialPaymentAmount({ service: "Research writing course", status: "QUOTATION", amount_zmw: 350 })).toBe(350);
    expect(commercialPaymentAmount({ service: "AI-Assisted Research Proposal Writing", status: "QUOTATION", amount_zmw: 350 })).toBe(350);
    expect(commercialPaymentAmount({ service: "Research Proposal", status: "INVOICE_UNPAID", amount_zmw: 6500, balance_zmw: 1200 })).toBe(1200);
    expect(commercialPaymentAmount({ service: "Custom service", status: "QUOTATION", amount_zmw: null })).toBeNull();
  });

  it("creates a request without client name, email or payer phone, and keeps its quote reference", async () => {
    vi.stubEnv("RESEARCH_ASSISTANT_SECRET", "test-secret");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, payment: { token: "abc", link: "https://www.medmindslc.online/pay/abc" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    await createResearchPaymentRequest({ title: "EMKP support", amountZmw: 3250, sourceReference: "quotation:reference:3250.00" });
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload).toMatchObject({ amount: 3250, openLink: true, sourceReference: "quotation:reference:3250.00" });
    expect(payload).not.toHaveProperty("customerEmail");
    expect(payload).not.toHaveProperty("customerPhone");
    expect(payload).not.toHaveProperty("customerName");
  });

  it("puts only the company account and a clickable anonymous link in the quotation", () => {
    const pdf = buildCommercialPdf({ name: "Chipo Harriet", phone: "260979259015" }, {
      id: "11111111-2222-4333-8444-555555555555", status: "QUOTATION", service: "EMKP application support", amount_zmw: 6500,
      details: "Application review, workplan and budget.\nSubmit payment to 0977259132, registered to Juma Phiri.",
    });
    const raw = pdf.toString("latin1");
    expect(raw).toContain(MEDMINDS_BANK.accountNumber);
    expect(raw).toContain("50% deposit: K3,250.00");
    expect(raw).toContain("/Subtype /Link");
    expect(raw).toContain("https://sales.medmindslc.online/pay/11111111-2222-4333-8444-555555555555");
    expect(raw).not.toContain("0977259132");
    expect(raw).not.toContain("260979259015");
    if (process.env.QUOTATION_PREVIEW_PATH) writeFileSync(process.env.QUOTATION_PREVIEW_PATH, pdf);
  });
});
