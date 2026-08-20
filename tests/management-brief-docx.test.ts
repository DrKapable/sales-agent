import { describe, expect, it } from "vitest";
import { createManagementBriefDocx } from "@/lib/management-brief-docx";

const brief = `## Executive summary\n- **58 leads** entered the CRM.\n\n## Recommended actions\n1. Follow up hot unconverted leads.`;

describe("management brief DOCX export", () => {
  it("creates a genuine OOXML Word package", () => {
    const word = createManagementBriefDocx({ analysis: brief, days: 30, generatedAt: "2026-08-20T08:00:00.000Z" });
    expect(word.subarray(0, 2).toString("utf8")).toBe("PK");
    const raw = word.toString("utf8");
    expect(raw).toContain("word/document.xml");
    expect(raw).toContain("MedMinds Business Intelligence");
    expect(raw).toContain("Executive summary");
  });
});
