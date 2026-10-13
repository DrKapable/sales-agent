import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), neon: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));

beforeEach(() => {
  vi.resetModules();
  mocks.query.mockReset();
  mocks.neon.mockReset().mockReturnValue({ query: mocks.query });
  vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
});
afterEach(() => vi.unstubAllEnvs());

describe("persistent auto follow-up controls", () => {
  it("keeps existing installations active until an administrator pauses them", async () => {
    mocks.query.mockResolvedValue([]);
    const { getFollowUpAutomation } = await import("@/lib/follow-up-automation");
    expect(await getFollowUpAutomation()).toEqual({ paused: false, configured: true, updatedAt: null });
  });

  it("persists pause and resume across separate server instances", async () => {
    let paused = false;
    mocks.query.mockImplementation(async (statement: string, values?: unknown[]) => {
      if (statement.startsWith("CREATE")) return [];
      if (statement.startsWith("INSERT")) paused = values?.[0] === true;
      return [{ paused, updated_at: "2026-10-13T13:00:00Z" }];
    });
    let controls = await import("@/lib/follow-up-automation");
    expect((await controls.setFollowUpAutomationPaused(true)).paused).toBe(true);
    vi.resetModules();
    controls = await import("@/lib/follow-up-automation");
    expect((await controls.getFollowUpAutomation()).paused).toBe(true);
    expect((await controls.setFollowUpAutomationPaused(false)).paused).toBe(false);
    vi.resetModules();
    controls = await import("@/lib/follow-up-automation");
    expect((await controls.getFollowUpAutomation()).paused).toBe(false);
  });

  it("disables the control without a database and does not claim a successful save", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const controls = await import("@/lib/follow-up-automation");
    expect(await controls.getFollowUpAutomation()).toEqual({ paused: true, configured: false, updatedAt: null });
    await expect(controls.setFollowUpAutomationPaused(true)).rejects.toThrow("unavailable");
    expect(mocks.neon).not.toHaveBeenCalled();
  });

  it("retries initialization after a database failure", async () => {
    mocks.query.mockRejectedValueOnce(new Error("connection lost")).mockResolvedValue([]);
    const controls = await import("@/lib/follow-up-automation");
    await expect(controls.getFollowUpAutomation()).rejects.toThrow("connection lost");
    expect((await controls.getFollowUpAutomation()).configured).toBe(true);
  });
});
