import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ state: vi.fn(), save: vi.fn(), list: vi.fn(), schedule: vi.fn(), after: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after, NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));
vi.mock("@/lib/follow-up-automation", () => ({ getFollowUpAutomation: mocks.state, setFollowUpAutomationPaused: mocks.save }));
vi.mock("@/lib/human-follow-ups", () => ({ listHumanFollowUps: mocks.list, scheduleManualHumanFollowUp: mocks.schedule, completeHumanFollowUp: vi.fn(), sendHumanFollowUpSms: vi.fn(), syncHumanFollowUpQueue: vi.fn() }));
vi.mock("@/lib/mary-automatic-follow-ups", () => ({ runMaryAutomaticFollowUps: vi.fn() }));
import { GET, POST } from "@/app/api/admin/follow-ups/route";

function request(body: unknown) {
  return new Request("https://sales.medmindslc.online/api/admin/follow-ups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state.mockResolvedValue({ paused: true, configured: true, updatedAt: null });
  mocks.list.mockResolvedValue({ tasks: [], availableLeads: [], smsConfigured: false });
});

describe("follow-up automation API", () => {
  it("returns saved pause state and avoids starting a background sender when paused", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).automation.paused).toBe(true);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("saves both pause and resume through the same action", async () => {
    for (const paused of [true, false]) {
      mocks.save.mockResolvedValue({ paused, configured: true, updatedAt: "2026-10-13T13:00:00Z" });
      const response = await POST(request({ action: "set_automation_paused", paused }));
      expect(response.status).toBe(200);
      expect((await response.json()).automation.paused).toBe(paused);
      expect(mocks.save).toHaveBeenLastCalledWith(paused);
    }
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("rejects malformed pause values without saving", async () => {
    const response = await POST(request({ action: "set_automation_paused", paused: "false" }));
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps manual scheduling available when auto follow-up is paused", async () => {
    mocks.schedule.mockResolvedValue({ id: "manual-task" });
    const response = await POST(request({ action: "schedule", phone: "260977000000", scheduledAt: new Date(Date.now() + 86400000).toISOString(), createdBy: "Dr Kanyembo Ng'andwe" }));
    expect(response.status).toBe(200);
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
