import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_DOCUMENT_TEMPLATES, ensureClientDocumentTemplate } from "@/lib/client-document-templates";
import { isAuthorizedTemplateSetup } from "@/lib/template-setup-auth";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v25.0");
  vi.stubEnv("WHATSAPP_BUSINESS_ACCOUNT_ID", "business");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Meta client PDF template submission", () => {
  it.each(["quotation", "receipt"] as const)("uploads a PDF approval sample and creates the %s utility template", async (kind) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(response({ id: "upload:sample?sig=sample" }))
      .mockResolvedValueOnce(response({ h: "4::sample-document-handle" }))
      .mockResolvedValueOnce(response({ id: "template-id", status: "PENDING" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await ensureClientDocumentTemplate(kind)).toMatchObject({ name: CLIENT_DOCUMENT_TEMPLATES[kind].name, status: "PENDING", id: "template-id" });
    const sessionUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(sessionUrl.pathname).toBe("/v25.0/app/uploads");
    expect(sessionUrl.searchParams.get("file_type")).toBe("application/pdf");
    const upload = fetchMock.mock.calls[2][1];
    expect(upload.headers).toMatchObject({ Authorization: "OAuth test-token", file_offset: "0" });
    expect(Buffer.from(upload.body).subarray(0, 4).toString()).toBe("%PDF");
    const creation = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(creation).toMatchObject({ name: CLIENT_DOCUMENT_TEMPLATES[kind].name, language: "en_US", category: "UTILITY" });
    expect(creation.components[0]).toEqual({ type: "HEADER", format: "DOCUMENT", example: { header_handle: ["4::sample-document-handle"] } });
    expect(creation.components[1].example.body_text[0]).toHaveLength(3);
  });

  it("reuses an existing pending template without submitting a duplicate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [{ name: CLIENT_DOCUMENT_TEMPLATES.receipt.name, language: "en_US", status: "PENDING", components: [{ type: "HEADER", format: "DOCUMENT" }] }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await ensureClientDocumentTemplate("receipt")).toMatchObject({ status: "PENDING" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not report successful creation when the sample upload fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ data: [] })).mockResolvedValueOnce(response({ error: { message: "Permission denied", code: 200 } }, 403)));
    await expect(ensureClientDocumentTemplate("quotation")).rejects.toThrow("403");
  });
});

describe("scoped template maintenance authentication", () => {
  it("accepts the matching token only before its expiry", () => {
    vi.stubEnv("CRON_SECRET", "");
    const now = 1700000000000;
    const token = `${now + 300000}.${"a".repeat(64)}`;
    vi.stubEnv("WHATSAPP_TEMPLATE_SETUP_TOKEN", token);
    const request = new Request("https://example.com", { headers: { Authorization: `Bearer ${token}` } });
    expect(isAuthorizedTemplateSetup(request, now)).toBe(true);
    expect(isAuthorizedTemplateSetup(request, now + 300000)).toBe(false);
    expect(isAuthorizedTemplateSetup(new Request("https://example.com"), now)).toBe(false);
    expect(isAuthorizedTemplateSetup(request, now - 3600000)).toBe(false);
  });
});
