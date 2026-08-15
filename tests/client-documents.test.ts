import { describe, expect, it } from "vitest";
import { resolveClientDocumentMime, validateClientDocumentBytes } from "@/lib/client-documents";

describe("client document validation", () => {
  it("accepts a PDF with the expected signature", () => {
    const mime = resolveClientDocumentMime("guide.pdf", "application/pdf");
    expect(mime).toBe("application/pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(validateClientDocumentBytes("guide.pdf", mime!, bytes).valid).toBe(true);
  });

  it("rejects a renamed binary file pretending to be PDF", () => {
    const mime = resolveClientDocumentMime("guide.pdf", "application/pdf");
    const bytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    expect(validateClientDocumentBytes("guide.pdf", mime!, bytes).valid).toBe(false);
  });

  it("accepts Open XML Office ZIP signatures", () => {
    const mime = resolveClientDocumentMime("proposal.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(validateClientDocumentBytes("proposal.docx", mime!, bytes).valid).toBe(true);
  });

  it("rejects binary content in TXT and CSV files", () => {
    const mime = resolveClientDocumentMime("clients.csv", "text/csv");
    const bytes = new Uint8Array([0x61, 0x2c, 0x62, 0x00, 0xff]);
    expect(validateClientDocumentBytes("clients.csv", mime!, bytes).valid).toBe(false);
  });

  it("rejects mismatched supplied MIME types", () => {
    expect(resolveClientDocumentMime("report.pdf", "application/msword")).toBeNull();
  });
});
