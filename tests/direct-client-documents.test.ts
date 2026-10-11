import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeClientWhatsAppNumber } from "@/lib/direct-document-input";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getLead: vi.fn(), getOrCreate: vi.fn(), updateLead: vi.fn(), createQuote: vi.fn(), payment: vi.fn(), ensureColumns: vi.fn(), addMessage: vi.fn(), history: vi.fn(), status: vi.fn(), accepted: vi.fn(), delivery: vi.fn(), markQuote: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: mocks.query }) }));
vi.mock("@/lib/store", () => ({ getLead: mocks.getLead, getOrCreateLead: mocks.getOrCreate, updateLead: mocks.updateLead, addMessage: mocks.addMessage, getConversation: mocks.history }));
vi.mock("@/lib/business-ops", () => ({ createQuote: mocks.createQuote }));
vi.mock("@/lib/payment-finance", async (original) => ({ ...await original<typeof import("@/lib/payment-finance")>(), ensureFinancialColumns: mocks.ensureColumns, recordFinancialPayment: mocks.payment }));
vi.mock("@/lib/client-document-templates", () => ({ clientDocumentTemplateStatus: mocks.status, hasDocumentHeader: () => true, clientDocumentTemplateResults: async () => [] }));
vi.mock("@/lib/message-delivery", () => ({ recordOutgoingMessageAccepted: mocks.accepted, getOutgoingMessageDelivery: mocks.delivery }));
vi.mock("@/lib/quotation-delivery", () => ({ markQuoteAccepted: mocks.markQuote }));
import { GET, POST } from "@/app/api/admin/business/direct-documents/route";

const lead = { id: "client-1", name: "New Client", phone: "260979259015", serviceInterest: "Research support" };
const quote = { id: "11111111-1111-4111-8111-111111111111", lead_id: lead.id, service: "Research support", amount_zmw: 1750, details: "Proposal review and formatting", status: "QUOTATION" };
const payment = { id: "22222222-2222-4222-8222-222222222222", lead_id: lead.id, amount_zmw: 500, total_charged_zmw: 1750, amount_paid_zmw: 500, balance_zmw: 1250, reference: "BANK-123", status: "VERIFIED" };
const post = (body: unknown) => POST(new Request("https://example.com/api/admin/business/direct-documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://fake");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v25.0");
  vi.stubEnv("WHATSAPP_BUSINESS_ACCOUNT_ID", "business");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
  mocks.getLead.mockResolvedValue(lead);
  mocks.getOrCreate.mockResolvedValue(lead);
  mocks.updateLead.mockResolvedValue(lead);
  mocks.createQuote.mockResolvedValue(quote);
  mocks.payment.mockResolvedValue({ payment });
  mocks.query.mockResolvedValue([quote]);
  mocks.status.mockResolvedValue({ name: "medminds_client_quotation_pdf_v1", language: "en_US", status: "APPROVED", components: [{ type: "HEADER", format: "DOCUMENT" }] });
  mocks.accepted.mockResolvedValue(undefined);
  mocks.markQuote.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("direct recipient validation", () => {
  it.each([['0979 259 015', '260979259015'], ['0761234567', '260761234567'], ['+260 (979) 259-015', '260979259015'], ['00260 979259015', '260979259015'], ['+44 7911 123456', '447911123456']])("normalizes %s", (input, expected) => {
    expect(normalizeClientWhatsAppNumber(input)).toBe(expected);
  });
  it.each(["Mary 0979259015", "123", "000000000000", "+1234567890123456", "0979/259015"])("rejects %s", (input) => { expect(normalizeClientWhatsAppNumber(input)).toBeNull(); });
});

describe("direct quotation and receipt workflow", () => {
  it("creates a quotation for a number with no prior messages without sending or fabricating inbound history", async () => {
    const response = await post({ action: "create_quotation", phone: "0979259015", name: "New Client", service: "Research support", amountZmw: 1750, details: quote.details });
    expect(response.status).toBe(201);
    expect((await response.json()).document.id).toBe(quote.id);
    expect(mocks.getOrCreate).toHaveBeenCalledWith(lead.phone, "whatsapp");
    expect(mocks.createQuote).toHaveBeenCalledWith({ leadId: lead.id, service: "Research support", amountZmw: 1750, details: quote.details, status: "QUOTATION" });
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.addMessage).not.toHaveBeenCalled();
  });
  it("sends the saved new-client quotation as a DOCUMENT template through Mary's configured sender", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "pdf-media" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.direct" }] })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await post({ action: "send", phone: "0979259015", kind: "quotation", documentId: quote.id });
    expect(response.status).toBe(200);
    expect((await response.json()).delivery).toMatchObject({ status: "ACCEPTED", mode: "template", messageId: "wamid.direct" });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("lead_id=$2"), [quote.id, lead.id]);
    expect(mocks.history).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][0]).toBe("https://graph.facebook.com/v25.0/1234567890/messages");
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent).toMatchObject({ to: lead.phone, type: "template", template: { name: "medminds_client_quotation_pdf_v1" } });
    expect(sent.template.components[0].parameters[0]).toMatchObject({ type: "document", document: { id: "pdf-media" } });
    expect(mocks.markQuote).toHaveBeenCalledWith(quote.id, "wamid.direct");
    expect(mocks.createQuote).not.toHaveBeenCalled();
    expect(mocks.payment).not.toHaveBeenCalled();
  });
  it("keeps the saved document available when Meta approval is pending", async () => {
    mocks.status.mockResolvedValue({ status: "PENDING" });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await post({ action: "send", phone: lead.phone, kind: "quotation", documentId: quote.id });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("PENDING");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.createQuote).not.toHaveBeenCalled();
  });
  it("sends a manually recorded receipt to a first-time number using the receipt PDF template", async () => {
    mocks.query.mockResolvedValue([{ ...payment, status: "PENDING", verified_at: null }]);
    mocks.status.mockResolvedValue({ name: "medminds_client_receipt_pdf_v1", language: "en_US", status: "APPROVED" });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "receipt-media" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.receipt" }] })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await post({ action: "send", phone: "0979259015", kind: "receipt", documentId: payment.id });
    expect(response.status).toBe(200);
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent.template.name).toBe("medminds_client_receipt_pdf_v1");
    expect(sent.template.components[0].parameters[0]).toMatchObject({ type: "document", document: { id: "receipt-media" } });
    expect(sent.template.components[1].parameters[2]).toEqual({ type: "text", text: "500.00" });
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.payment).not.toHaveBeenCalled();
  });
  it("refuses to send or preview a document belonging to another number", async () => {
    mocks.query.mockResolvedValue([]);
    const response = await post({ action: "send", phone: lead.phone, kind: "receipt", documentId: payment.id });
    expect(response.status).toBe(409);
    expect(mocks.status).not.toHaveBeenCalled();
    const preview = await GET(new Request(`https://example.com/api/admin/business/direct-documents?phone=${lead.phone}&kind=receipt&documentId=${payment.id}`));
    expect(preview.status).toBe(400);
  });
  it("creates an outside-platform receipt without verification or a transaction reference", async () => {
    const response = await post({ action: "create_receipt", phone: lead.phone, name: lead.name, service: lead.serviceInterest, totalChargedZmw: 1750, amountPaidZmw: 500, recordedBy: "Sales staff" });
    expect(response.status).toBe(201);
    expect(mocks.payment).toHaveBeenCalledWith(expect.objectContaining({ verified: false, recordedBy: "Sales staff", amountPaidZmw: 500 }));
  });
  it("rejects overpayment before creating a client or recording money", async () => {
    const response = await post({ action: "create_receipt", phone: lead.phone, name: lead.name, service: lead.serviceInterest, totalChargedZmw: 100, amountPaidZmw: 500, reference: "BANK-123", verified: true, verifiedBy: "Admin" });
    expect(response.status).toBe(400);
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });
  it("saves verified payment totals and reference separately from sending", async () => {
    const response = await post({ action: "create_receipt", phone: lead.phone, name: lead.name, service: lead.serviceInterest, totalChargedZmw: 1750, amountPaidZmw: 500, reference: "BANK-123", verified: true, verifiedBy: "Admin" });
    expect(response.status).toBe(201);
    expect(mocks.payment).toHaveBeenCalledWith({ leadId: lead.id, totalChargedZmw: 1750, amountPaidZmw: 500, reference: "BANK-123", verified: true, verifiedBy: "Admin", recordedBy: undefined, service: lead.serviceInterest });
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("opens the verified receipt PDF for preview without sending it", async () => {
    mocks.query.mockResolvedValue([payment]);
    const response = await GET(new Request(`https://example.com/api/admin/business/direct-documents?phone=${lead.phone}&kind=receipt&documentId=${payment.id}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("reports asynchronous WhatsApp failure instead of treating API acceptance as delivery", async () => {
    mocks.query.mockResolvedValue([{ ...quote, delivery_status: "FAILED", delivery_error: "Business eligibility payment issue: unsettled payments" }]);
    const response = await GET(new Request(`https://example.com/api/admin/business/direct-documents?phone=${lead.phone}&kind=quotation&documentId=${quote.id}&delivery=true`));
    expect(await response.json()).toEqual({ status: "FAILED", error: "Business eligibility payment issue: unsettled payments" });
  });
  it("reads receipt delivery for the document's own recipient", async () => {
    mocks.query.mockResolvedValue([{ ...payment, status: "PENDING" }]);
    mocks.delivery.mockResolvedValue({ status: "DELIVERED", error: null });
    const response = await GET(new Request(`https://example.com/api/admin/business/direct-documents?phone=${lead.phone}&kind=receipt&documentId=${payment.id}&delivery=true&messageId=wamid.receipt`));
    expect(await response.json()).toEqual({ status: "DELIVERED", error: null });
    expect(mocks.delivery).toHaveBeenCalledWith("wamid.receipt", lead.phone);
  });
  it("uses a read-only lookup for new numbers instead of creating a lead", async () => {
    mocks.getLead.mockResolvedValue(null);
    const response = await GET(new Request(`https://example.com/api/admin/business/direct-documents?phone=${lead.phone}`));
    expect(await response.json()).toEqual({ lead: null, quotations: [], receipts: [] });
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });
});
