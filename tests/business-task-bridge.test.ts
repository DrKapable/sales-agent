import { describe, expect, it } from "vitest";
import { researchPortalTaskFromBusinessTask } from "../lib/business-task-bridge";
import type { Lead } from "../lib/types";

const lead: Lead = {
  id: "lead-1",
  phone: "260970000000",
  name: "Amina Banda",
  email: null,
  institution: "UNZA",
  programme: "MPH",
  serviceInterest: "Research proposal",
  deadline: "14 days",
  packageName: null,
  status: "INTERESTED",
  handoffReason: null,
  aiPaused: false,
  assignedTo: null,
  internalNote: null,
  priority: "STANDARD",
  followUpAt: null,
  source: "whatsapp",
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z"
};

describe("Business Intelligence task Research Portal mirror", () => {
  it("keeps the task title, notes, priority and due date while adding available client context", () => {
    const payload = researchPortalTaskFromBusinessTask({
      leadId: lead.id,
      title: "Review client proposal",
      assignedTo: "Dr. Monica",
      dueAt: "2026-08-18T08:00:00.000Z",
      notes: "Review the uploaded proposal and prepare the next operational step.",
      priority: "high"
    }, lead);

    expect(payload.title).toBe("Review client proposal");
    expect(payload.brief).toContain("Review the uploaded proposal");
    expect(payload.brief).toContain("Client: Amina Banda.");
    expect(payload.brief).toContain("Service: Research proposal.");
    expect(payload.brief).toContain("Business Intelligence assignee: Dr. Monica.");
    expect(payload.dueDate).toBe("2026-08-18T08:00:00.000Z");
    expect(payload.program).toBe("MPH");
    expect(payload.academicLevel).toBeUndefined();
    expect(payload.priority).toBe("high");
  });

  it("defaults priority to standard and creates a valid brief when notes are omitted", () => {
    const payload = researchPortalTaskFromBusinessTask({ title: "Call supplier" }, null);
    expect(payload.brief).toContain("Business Intelligence task: Call supplier.");
    expect(payload.priority).toBe("standard");
  });
});
