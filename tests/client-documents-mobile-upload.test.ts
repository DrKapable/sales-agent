import { describe, expect, it } from "vitest";
import { resolveClientDocumentMime, validateClientDocumentBytes } from "@/lib/client-documents";

describe("mobile document upload compatibility", () => {
  it("can resolve a PDF from its filename when a mobile picker supplies no useful MIME type", () => {
    expect(resolveClientDocumentMime("client-document.pdf", null)).toBe("application/pdf");
    expect(resolveClientDocumentMime("client-document.pdf", "application/octet-stream")).toBe("application/pdf");
  });

  it("can resolve Open XML files from their extension for generic Android picker metadata", () => {
    expect(resolveClientDocumentMime("proposal.docx", null)).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(resolveClientDocumentMime("results.xlsx", "application/octet-stream")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("can resolve CSV files from their extension when a phone does not provide text/csv", () => {
    expect(resolveClientDocumentMime("clients.csv", null)).toBe("text/csv");
    const bytes = new TextEncoder().encode("name,phone\nMary,260977000000\n");
    expect(validateClientDocumentBytes("clients.csv", "text/csv", bytes).valid).toBe(true);
  });

  it("still rejects a fake PDF after extension fallback because byte validation remains authoritative", () => {
    const mime = resolveClientDocumentMime("fake.pdf", null);
    const fakeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    expect(mime).toBe("application/pdf");
    expect(validateClientDocumentBytes("fake.pdf", mime!, fakeBytes).valid).toBe(false);
  });
});
