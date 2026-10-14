import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ quote: vi.fn(), lead: vi.fn(), pdf: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/business-ops", () => ({ getPayableQuote: mocks.quote }));
vi.mock("@/lib/store", () => ({ getLeadById: mocks.lead }));
vi.mock("@/lib/commercial-document", () => ({ buildCommercialPdf: mocks.pdf, commercialDocumentNumber: () => "QUO-C55373DF" }));
vi.mock("@/lib/session", () => ({ sessionCookieName: "session", verifySessionToken: mocks.verify }));
import { GET } from "@/app/api/documents/[id]/route";
import { proxy } from "@/proxy";

const id = "c55373df-0000-4000-8000-000000000000";
beforeEach(() => { vi.clearAllMocks(); mocks.verify.mockReturnValue(true); });

describe("quotation PDF retrieval", () => {
  it("fetches an older quotation directly by ID without a bounded business snapshot", async () => {
    const record = { id, lead_id: "client-id", status: "QUOTATION", amount_zmw: 800 };
    const lead = { name: "Maimba Bertha", phone: "260775731407" };
    mocks.quote.mockResolvedValue(record); mocks.lead.mockResolvedValue(lead);
    mocks.pdf.mockReturnValue(new TextEncoder().encode("%PDF-test"));
    const response = await GET(new NextRequest(`https://sales.medmindslc.online/api/documents/${id}`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(mocks.quote).toHaveBeenCalledWith(id);
    expect(mocks.lead).toHaveBeenCalledWith("client-id");
    expect(mocks.pdf).toHaveBeenCalledWith(lead, record);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe("%PDF-test");
  });
  it("returns 404 when the quote or linked client no longer exists", async () => {
    mocks.quote.mockResolvedValue(null);
    expect((await GET(new NextRequest("https://sales.medmindslc.online"), { params: Promise.resolve({ id }) })).status).toBe(404);
    mocks.quote.mockResolvedValue({ id, lead_id: "missing" }); mocks.lead.mockResolvedValue(null);
    expect((await GET(new NextRequest("https://sales.medmindslc.online"), { params: Promise.resolve({ id }) })).status).toBe(404);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
});

describe("PDF embedding policy", () => {
  it("allows same-origin PDF previews while blocking framing of the admin application", () => {
    const pdf = proxy(new NextRequest(`https://sales.medmindslc.online/api/documents/${id}`));
    const app = proxy(new NextRequest("https://sales.medmindslc.online/admin"));
    expect(pdf.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(app.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
  it("still requires admin authentication for assigned-document previews", () => {
    mocks.verify.mockReturnValue(false);
    const response = proxy(new NextRequest(`https://sales.medmindslc.online/api/admin/client-documents/${id}`));
    expect(response.status).toBe(401);
  });
});
