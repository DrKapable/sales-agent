import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ record: vi.fn(), send: vi.fn(), leads: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/payment-finance", () => ({ recordFinancialPayment: mocks.record }));
vi.mock("@/lib/store", () => ({ listLeads: mocks.leads }));
vi.mock("@/lib/business-notifications", () => ({ notifyBusinessEvent: mocks.notify }));
vi.mock("@/lib/receipt-delivery", () => ({ sendBrandedReceiptPdf: mocks.send }));
import { POST } from "@/app/api/admin/business/finance/route";
const lead = { id: "lead-1", name: "Manual client", phone: "260970000000" };
const payment = { id: "payment-1", status: "PENDING", amount_zmw: 500 };
const post = () => POST(new Request("https://example.com/api/admin/business/finance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "payment", leadId: lead.id, totalChargedZmw: 1750, amountPaidZmw: 500 }) }));
beforeEach(() => { vi.clearAllMocks(); mocks.leads.mockResolvedValue([lead]); mocks.notify.mockResolvedValue(undefined); mocks.record.mockResolvedValue({ payment, totalChargedZmw: 1750, amountPaidZmw: 500, balanceZmw: 1250 }); mocks.send.mockResolvedValue({ messageId: "wamid.receipt" }); });
describe("manual and outside-platform payment receipts", () => {
  it("records the payment and automatically submits its receipt without verification", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "PENDING", receiptSent: true, receipt: { messageId: "wamid.receipt" } });
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ verified: false }));
    expect(mocks.send).toHaveBeenCalledWith({ lead, payment });
  });
  it("preserves the recorded payment and exposes the receipt error for retry", async () => {
    mocks.send.mockRejectedValue(new Error("WhatsApp billing blocked"));
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: payment.id, receiptSent: false, receiptError: "WhatsApp billing blocked" });
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });
});
