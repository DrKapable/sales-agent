import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/types";

const mocks = vi.hoisted(() => ({ history: vi.fn(), status: vi.fn(), upload: vi.fn(), freeform: vi.fn(), template: vi.fn(), addMessage: vi.fn(), recordAccepted: vi.fn() }));
vi.mock("@/lib/store", () => ({ getConversation: mocks.history, addMessage: mocks.addMessage }));
vi.mock("@/lib/client-document-templates", () => ({
  clientDocumentTemplateStatus: mocks.status,
  hasDocumentHeader: (template: { components: Array<{ type: string; format: string }> }) => template.components.some((item) => item.type === "HEADER" && item.format === "DOCUMENT")
}));
vi.mock("@/lib/whatsapp", () => ({ uploadWhatsAppPdf: mocks.upload, sendWhatsAppPdfDocument: mocks.freeform }));
vi.mock("@/lib/meta-templates", () => ({ sendApprovedMetaTemplate: mocks.template }));
vi.mock("@/lib/message-delivery", () => ({ recordOutgoingMessageAccepted: mocks.recordAccepted }));
import { clientDocumentSessionOpen, sendClientDocument } from "@/lib/client-document-delivery";
import { sendBrandedReceiptPdf } from "@/lib/receipt-delivery";

const input = { kind: "quotation" as const, phone: "260970000000", clientName: "Sample Client", documentNumber: "QUO-123", detail: "Research\nproposal", pdf: new Uint8Array([1, 2]), filename: "quote.pdf", caption: "Quotation attached", phoneNumberIdOverride: "sender-id" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.history.mockResolvedValue([]);
  mocks.status.mockResolvedValue({ name: "medminds_client_quotation_pdf_v1", language: "en_US", status: "APPROVED", components: [{ type: "HEADER", format: "DOCUMENT" }] });
  mocks.upload.mockResolvedValue({ mediaId: "media-id" });
  mocks.template.mockResolvedValue({ messageId: "template-message" });
  mocks.freeform.mockResolvedValue({ messageId: "freeform-message", mediaId: "media-id" });
  mocks.recordAccepted.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

describe("client PDF delivery", () => {
  it("attaches the uploaded PDF and all three body parameters outside the window", async () => {
    await expect(sendClientDocument(input)).resolves.toEqual({ messageId: "template-message", mediaId: "media-id" });
    expect(mocks.template).toHaveBeenCalledWith({ phone: input.phone, name: "medminds_client_quotation_pdf_v1", language: "en_US", phoneNumberIdOverride: "sender-id", components: [
      { type: "header", parameters: [{ type: "document", document: { id: "media-id", filename: "quote.pdf" } }] },
      { type: "body", parameters: [{ type: "text", text: "Sample Client" }, { type: "text", text: "QUO-123" }, { type: "text", text: "Research proposal" }] }
    ] });
    expect(mocks.freeform).not.toHaveBeenCalled();
  });
  it.each(["PENDING", "REJECTED", "PAUSED"])("blocks an unapproved %s template without uploading or sending", async (status) => {
    mocks.status.mockResolvedValue({ status, components: [{ type: "HEADER", format: "DOCUMENT" }] });
    await expect(sendClientDocument(input)).rejects.toThrow(status);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.template).not.toHaveBeenCalled();
    expect(mocks.freeform).not.toHaveBeenCalled();
  });
  it("rejects a text-only template even if approved", async () => {
    mocks.status.mockResolvedValue({ status: "APPROVED", components: [] });
    await expect(sendClientDocument(input)).rejects.toThrow("must be APPROVED");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("uses normal PDF delivery inside an active client window", async () => {
    mocks.history.mockResolvedValue([{ role: "user", createdAt: new Date(Date.now() - 1000).toISOString() }]);
    await expect(sendClientDocument(input)).resolves.toMatchObject({ messageId: "freeform-message" });
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.freeform).toHaveBeenCalledWith(input);
  });
  it("closes the window exactly at 24 hours and ignores future inbound timestamps", async () => {
    const now = 1700000000000;
    for (const timestamp of [now - 86400000, now + 1000]) {
      mocks.history.mockResolvedValue([{ role: "user", createdAt: new Date(timestamp).toISOString() }]);
      expect(await clientDocumentSessionOpen(input.phone, now)).toBe(false);
    }
  });
});

describe("recorded payment receipt delivery", () => {
  const lead = { phone: input.phone, name: "Sample Client" } as Lead;
  it.each([undefined, "FAILED", "CANCELLED", "REFUNDED"])("refuses a receipt for payment status %s", async (status) => {
    await expect(sendBrandedReceiptPdf({ lead, payment: { id: "12345678", amount_zmw: 1750, status } })).rejects.toThrow("Receipts require a recorded payment");
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.template).not.toHaveBeenCalled();
  });
  it("sends a manually recorded receipt without verification", async () => {
    const result = await sendBrandedReceiptPdf({ lead, payment: { id: "12345678", amount_zmw: 500, total_charged_zmw: 1750, balance_zmw: 1250, status: "PENDING", created_at: "2026-10-11T11:00:00Z" } });
    expect(result).toMatchObject({ sent: true, amountPaidZmw: 500, balanceZmw: 1250 });
  });
  it.each([0, -1, NaN, Infinity])("refuses invalid recorded amounts %s", async (amount) => {
    await expect(sendBrandedReceiptPdf({ lead, payment: { id: "12345678", amount_zmw: amount, status: "PENDING" } })).rejects.toThrow("amounts are invalid");
    expect(mocks.template).not.toHaveBeenCalled();
  });
  it("sends a verified receipt as a PDF template and records the accepted message ID", async () => {
    mocks.status.mockResolvedValue({ name: "medminds_client_receipt_pdf_v1", language: "en_US", status: "APPROVED", components: [{ type: "HEADER", format: "DOCUMENT" }] });
    const result = await sendBrandedReceiptPdf({ lead, payment: { id: "12345678", amount_zmw: 1750, status: "VERIFIED" } });
    expect(result.messageId).toBe("template-message");
    expect(mocks.template.mock.calls[0][0].components[1].parameters[2]).toEqual({ type: "text", text: "1750.00" });
    expect(mocks.addMessage).toHaveBeenCalledWith(input.phone, "assistant", expect.stringContaining("MM-12345678"), "template-message");
    expect(mocks.recordAccepted).toHaveBeenCalledWith({ phone: input.phone, messageId: "template-message" });
  });
});
