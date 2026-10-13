import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: vi.fn(), query: vi.fn(), inventory: vi.fn(), send: vi.fn(), leads: vi.fn(), update: vi.fn(), add: vi.fn(), record: vi.fn()
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: mocks.query }) }));
vi.mock("@/lib/follow-up-automation", () => ({ getFollowUpAutomation: mocks.state }));
vi.mock("@/lib/meta-templates", () => ({ getApprovedMetaTemplateInventory: mocks.inventory, sendApprovedMetaTemplate: mocks.send }));
vi.mock("@/lib/store", () => ({ listLeads: mocks.leads, updateLead: mocks.update, addMessage: mocks.add }));
vi.mock("@/lib/message-delivery", () => ({ recordOutgoingMessageAccepted: mocks.record }));
import { runMaryAutomaticFollowUps } from "@/lib/mary-automatic-follow-ups";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
  mocks.state.mockResolvedValue({ paused: false, configured: true });
  mocks.inventory.mockResolvedValue({ templates: [{ name: "medminds_follow_up", language: "en", components: [{ type: "BODY", text: "Hello" }] }] });
  mocks.leads.mockResolvedValue([{ id: "lead-1", phone: "260977000000", name: "Client", status: "INTERESTED" }]);
  mocks.query.mockImplementation(async (statement: string) => statement.startsWith("SELECT") ? [{ id: "task-1", phone: "260977000000", sequence_step: 3 }] : []);
  mocks.send.mockResolvedValue({ messageId: "message-1" });
  mocks.update.mockResolvedValue(undefined);
  mocks.record.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("Mary automatic follow-up pause", () => {
  it("does not contact Meta or change queued tasks while paused", async () => {
    mocks.state.mockResolvedValue({ paused: true, configured: true });
    expect(await runMaryAutomaticFollowUps()).toMatchObject({ sent: 0, skipped: "auto_follow_up_paused" });
    expect(mocks.inventory).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("stops a run paused after it started, before sending a queued message", async () => {
    mocks.state.mockResolvedValueOnce({ paused: false }).mockResolvedValue({ paused: true });
    expect(await runMaryAutomaticFollowUps()).toMatchObject({ sent: 0, skipped: "auto_follow_up_paused" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("sends due tasks again after resume", async () => {
    expect(await runMaryAutomaticFollowUps()).toMatchObject({ sent: 1, failed: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("leaves the rest of a batch pending when paused after one send", async () => {
    mocks.state.mockResolvedValueOnce({ paused: false }).mockResolvedValueOnce({ paused: false }).mockResolvedValue({ paused: true });
    mocks.leads.mockResolvedValue([
      { id: "lead-1", phone: "260977000000", status: "INTERESTED" },
      { id: "lead-2", phone: "260966000000", status: "INTERESTED" }
    ]);
    mocks.query.mockImplementation(async (statement: string) => statement.startsWith("SELECT") ? [
      { id: "task-1", phone: "260977000000", sequence_step: 3 },
      { id: "task-2", phone: "260966000000", sequence_step: 3 }
    ] : []);
    expect(await runMaryAutomaticFollowUps()).toMatchObject({ sent: 1, failed: 0, skipped: "auto_follow_up_paused" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(2); // select, then complete only the first task
  });

  it("fails closed if the saved state cannot be read", async () => {
    mocks.state.mockRejectedValue(new Error("database unavailable"));
    await expect(runMaryAutomaticFollowUps()).rejects.toThrow("database unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
