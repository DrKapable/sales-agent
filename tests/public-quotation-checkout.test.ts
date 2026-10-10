import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ record: null as any, create: vi.fn() }));
vi.mock("@/lib/business-ops", () => ({ getPayableQuote: async () => state.record }));
vi.mock("@/lib/research-payments", () => ({ createResearchPaymentRequest: state.create }));
import { GET } from "@/app/pay/[quoteId]/route";
const id = "11111111-2222-4333-8444-555555555555";
describe("public quotation checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.record = { id, service: "EMKP support", status: "QUOTATION", amount_zmw: 6500 };
    state.create.mockResolvedValue({ created: true, payment: { link: "https://www.medmindslc.online/pay/test" } });
  });
  it("redirects an anonymous visitor using only the approved quote amount", async () => {
    const response = await GET(new Request(`https://sales.medmindslc.online/pay/${id}`), { params: Promise.resolve({ quoteId: id }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://www.medmindslc.online/pay/test");
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ amountZmw: 3250, sourceReference: `quotation:${id}:3250.00` }));
    expect(state.create.mock.calls[0][0]).not.toHaveProperty("customerEmail");
    expect(state.create.mock.calls[0][0]).not.toHaveProperty("customerPhone");
  });
  it("does not create requests for missing quotes or unapproved amounts", async () => {
    state.record = null;
    expect((await GET(new Request("https://sales.medmindslc.online"), { params: Promise.resolve({ quoteId: id }) })).status).toBe(404);
    state.record = { id, service: "Custom service", status: "QUOTATION", amount_zmw: null };
    expect((await GET(new Request("https://sales.medmindslc.online"), { params: Promise.resolve({ quoteId: id }) })).status).toBe(409);
    expect(state.create).not.toHaveBeenCalled();
  });
});
