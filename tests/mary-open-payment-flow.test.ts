import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  lead: { id: "lead-1", phone: "260900000001", name: null, email: null, programme: null, deadline: null, serviceInterest: "EMKP support", status: "INTERESTED" },
  created: vi.fn(), messages: vi.fn(),
}));
vi.mock("@/lib/store", () => ({
  getOrCreateLead: async () => state.lead, getConversation: async () => [], listOffers: async () => [],
  addMessage: state.messages, updateLead: async (_phone: string, patch: object) => ({ ...state.lead, ...patch }),
}));
vi.mock("@/lib/prepared-quotation", () => ({ getLatestPreparedQuotation: async () => ({ id: "quote-1", service: "EMKP support", amount_zmw: 6500, status: "QUOTATION" }) }));
vi.mock("@/lib/team-notifications", () => ({ sendSalesPipelineCopies: vi.fn() }));
vi.mock("@/lib/research-payments", () => ({
  AI_RESEARCH_COURSE_PRICE_ZMW: 350, AI_RESEARCH_COURSE_URL: "https://www.medmindslc.online/courses/ai-enhanced-research-writing",
  latestPaymentTokenForLead: async () => null, checkResearchPayment: vi.fn(), createResearchPaymentRequest: state.created,
}));
import { handleMaryPaymentFlowV2 } from "@/lib/mary-payment-flow-v2";

describe("Mary's contact-free payment journey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.created.mockResolvedValue({ created: true, payment: { link: "https://www.medmindslc.online/pay/test" }, emailSent: false });
  });
  it("sends an approved quote's deposit link immediately without asking for contact details", async () => {
    const result = await handleMaryPaymentFlowV2({ phone: state.lead.phone, text: "Send me the payment link", source: "simulator" });
    expect(state.created).toHaveBeenCalledWith(expect.objectContaining({ amountZmw: 3250, sourceReference: "quotation:quote-1:3250.00" }));
    expect(state.created.mock.calls[0][0]).not.toHaveProperty("customerEmail");
    expect(state.created.mock.calls[0][0]).not.toHaveProperty("customerPhone");
    expect(result?.reply).toContain("https://www.medmindslc.online/pay/test");
    expect(result?.reply).toContain("63226093902");
    expect(result?.reply).not.toMatch(/what email|send the mobile money number|what full name/i);
  });
  it("does not create a payment request on a greeting", async () => {
    expect(await handleMaryPaymentFlowV2({ phone: state.lead.phone, text: "Hello", source: "simulator" })).toBeNull();
    expect(state.created).not.toHaveBeenCalled();
  });
});
