import { describe, expect, it } from "vitest";
import {
  contentMediaCategoryLabel,
  contentMediaVisualKind,
  normalizeContentMediaCategory
} from "@/lib/content-media-library";

describe("Content Studio media library", () => {
  it("normalizes supported categories and falls back safely", () => {
    expect(normalizeContentMediaCategory("testimonial")).toBe("testimonial");
    expect(normalizeContentMediaCategory("team-photo")).toBe("team-photo");
    expect(normalizeContentMediaCategory("unknown")).toBe("screenshot");
  });

  it("maps people photography to photo treatment", () => {
    expect(contentMediaVisualKind("student-photo")).toBe("photo");
    expect(contentMediaVisualKind("team-photo")).toBe("photo");
    expect(contentMediaVisualKind("screenshot")).toBe("screenshot");
    expect(contentMediaVisualKind("testimonial")).toBe("screenshot");
  });

  it("provides readable category labels", () => {
    expect(contentMediaCategoryLabel("screenshot")).toBe("Platform screenshot");
    expect(contentMediaCategoryLabel("campaign")).toBe("Campaign asset");
    expect(contentMediaCategoryLabel("student-photo")).toBe("Student photo");
  });
});
