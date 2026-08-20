import { describe, expect, it } from "vitest";
import { createManagementBriefPdf, createManagementBriefWord, parseManagementBrief } from "@/lib/management-brief-export";

const brief = `## Executive summary\n- **58 leads** entered the CRM.\n- Overall conversion is **3.4%**.\n\n## Recommended actions\n1. Follow up hot unconverted leads.\n2. Resolve unanswered client questions.`;

describe("management brief export", () => {
  it("parses headings, bullets and numbered actions", () => {
    const blocks = parseManagementBrief(brief);
    expect(blocks.some((block) => block.kind === "heading" && block.text === "Executive summary")).toBe(true);
    expect(blocks.filter((block) => block.kind === "bullet")).toHaveLength(2);
    expect(blocks.filter((block) => block.kind === "numbered")).toHaveLength(2);
  });

  it("creates a downloadable PDF document", () => {
    const pdf = createManagementBriefPdf({ analysis: brief, days: 30, generatedAt: "2026-08-20T08:00:00.000Z" });
    expect(pdf.subarray(0, 8).toString("utf8")).toContain("%PDF-1.4");
    expect(pdf.length).toBeGreaterThan(500);
  });

  it("creates a Word-compatible document with readable structure", () => {
    const word = createManagementBriefWord({ analysis: brief, days: 30 });
    expect(word).toContain("MedMinds Business Intelligence");
    expect(word).toContain("<h2>Executive summary</h2>");
    expect(word).toContain("<ol>");
  });
});
