import { describe, expect, it } from "vitest";
import {
  contentVisualPrompt,
  hasContentVisualSignature,
  isUploadedContentVisual,
  normalizeContentVisualKind,
  resolveContentVisualMime,
  sanitizeContentVisualFilename
} from "@/lib/content-visual-upload";

describe("Content Studio authentic visual uploads", () => {
  it("accepts supported browser image types", () => {
    expect(resolveContentVisualMime("screen.png", "image/png")).toBe("image/png");
    expect(resolveContentVisualMime("student.jpg", "image/jpeg")).toBe("image/jpeg");
    expect(resolveContentVisualMime("creative.webp", "image/webp")).toBe("image/webp");
  });

  it("falls back to a supported extension when the browser omits the MIME type", () => {
    expect(resolveContentVisualMime("prep-dashboard.jpeg", "")).toBe("image/jpeg");
    expect(resolveContentVisualMime("prep-dashboard.gif", "")).toBeNull();
  });

  it("verifies basic image signatures instead of trusting the filename alone", () => {
    expect(hasContentVisualSignature(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), "image/png")).toBe(true);
    expect(hasContentVisualSignature(new Uint8Array([0xff,0xd8,0xff,0xe0]), "image/jpeg")).toBe(true);
    expect(hasContentVisualSignature(new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]), "image/webp")).toBe(true);
    expect(hasContentVisualSignature(new Uint8Array([1,2,3,4]), "image/png")).toBe(false);
  });

  it("sanitizes uploaded filenames before storing them in visual metadata", () => {
    expect(sanitizeContentVisualFilename("../MedMinds\nPrep<>.png")).toBe("..-MedMinds-Prep.png");
  });

  it("records whether the authentic asset is a screenshot or a real photo", () => {
    expect(contentVisualPrompt("screenshot", "prep.png")).toBe("Uploaded platform screenshot: prep.png");
    expect(contentVisualPrompt("photo", "class.jpg")).toBe("Uploaded real photo: class.jpg");
    expect(isUploadedContentVisual("Uploaded real photo: class.jpg")).toBe(true);
    expect(isUploadedContentVisual("Generated with image model")).toBe(false);
  });

  it("defaults unknown kinds to screenshot", () => {
    expect(normalizeContentVisualKind("photo")).toBe("photo");
    expect(normalizeContentVisualKind("anything-else")).toBe("screenshot");
  });
});
