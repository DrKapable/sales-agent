import { describe, expect, it } from "vitest";
import {
  contentVisualPrompt,
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
