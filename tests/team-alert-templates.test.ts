import { describe, expect, it } from "vitest";
import { STAFF_ALERT_TEMPLATES, staffAlertKind } from "../lib/team-alert-templates";

describe("Meta staff alert template definitions", () => {
  it("keeps distinct template names, valid bodies and matching sample parameters", () => {
    const templates = Object.values(STAFF_ALERT_TEMPLATES);
    expect(new Set(templates.map((template) => template.name)).size).toBe(5);
    for (const template of templates) {
      expect(template.name).toMatch(/^[a-z0-9_]+$/);
      expect(template.text.length).toBeLessThanOrEqual(1024);
      expect([...template.text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]))).toEqual([1, 2, 3]);
      expect(template.example).toHaveLength(3);
    }
  });
  it("uses the general staff template for unrelated operational updates", () => {
    expect(staffAlertKind("Verified payment update")).toBe("staff");
  });
});
