import { describe, expect, it } from "vitest";
import { manualFollowUpOptions } from "@/lib/manual-follow-up-options";

function lead(overrides: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    phone: "260977000001",
    name: "Client",
    source: "whatsapp",
    status: "INTERESTED",
    priority: "WARM",
    serviceInterest: "Research Proposal",
    packageName: null,
    programme: null,
    deadline: null,
    followUpAt: null,
    handoffReason: null,
    assignedTo: null,
    aiPaused: false,
    score: 50,
    notes: null,
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-20T08:00:00.000Z",
    ...overrides
  } as any;
}

describe("manual follow-up client options", () => {
  it("shows every active lead so an existing automatic follow-up can be manually rescheduled", () => {
    const options = manualFollowUpOptions([
      lead({ name: "Brian", status: "INTERESTED" }),
      lead({ name: "Flora", status: "FOLLOW-UP REQUIRED", phone: "260977000002" }),
      lead({ name: "Converted", status: "CONVERTED", phone: "260977000003" }),
      lead({ name: "Lost", status: "LOST LEAD", phone: "260977000004" })
    ]);

    expect(options.map((item) => item.name)).toEqual(["Brian", "Flora"]);
  });
});
