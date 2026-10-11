import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(), activity: vi.fn(), followUps: vi.fn(), send: vi.fn()
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query: mocks.query }) }));
vi.mock("@/lib/business-ops", () => ({ getBusinessActivityForPeriod: mocks.activity }));
vi.mock("@/lib/follow-up", () => ({ getFollowUpActivityForPeriod: mocks.followUps }));
vi.mock("@/lib/team-notifications", () => ({ sendTeamCopies: mocks.send }));
import { previousLusakaDay } from "@/lib/daily-report-period";
import { runDailyManagementBrief } from "@/lib/daily-brief";

const activity = {
  newClients: 3, activeClients: 8, clientMessages: 21, teamReplies: 19,
  documentsCreated: 2, paymentsRecorded: 2, paymentsVerified: 1, verifiedAmountZmw: 1750,
  tasksCreated: 2, tasksCompleted: 1
};
const now = new Date("2026-10-11T06:18:09Z");
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "https://database.invalid");
  mocks.query.mockImplementation(async (query: string) => query.includes("INSERT INTO daily_management_briefs") ? [{ brief_date: "2026-10-11" }] : []);
  mocks.activity.mockResolvedValue(activity);
  mocks.followUps.mockResolvedValue({ sent: 5, responded: 2, freeform: 4, templates: 1 });
  mocks.send.mockResolvedValue([{ status: "fulfilled", value: { recipient: "Dr. Mustafa Juma Phiri", sent: true } }]);
});
afterEach(() => vi.unstubAllEnvs());

describe("previous calendar day in Zambia", () => {
  it("uses local midnight rather than a rolling 24-hour lookback", () => {
    expect(previousLusakaDay(now)).toMatchObject({
      reportDate: "2026-10-10", deliveryDate: "2026-10-11", label: "10 October 2026",
      start: "2026-10-09T22:00:00.000Z", end: "2026-10-10T22:00:00.000Z"
    });
  });
  it("rolls the report at Zambia midnight even while the UTC date is unchanged", () => {
    expect(previousLusakaDay(new Date("2026-10-10T21:59:59Z")).reportDate).toBe("2026-10-09");
    expect(previousLusakaDay(new Date("2026-10-10T22:00:00Z")).reportDate).toBe("2026-10-10");
  });
  it.each([
    ["2027-01-01T06:00:00Z", "2026-12-31"],
    ["2028-03-01T06:00:00Z", "2028-02-29"],
    ["2026-03-01T06:00:00Z", "2026-02-28"]
  ])("handles month/year boundaries for %s", (date, expected) => {
    expect(previousLusakaDay(new Date(date)).reportDate).toBe(expected);
  });
});

describe("daily management brief", () => {
  it("requests only yesterday's records, excludes staff, and dates the concise alert", async () => {
    const result = await runDailyManagementBrief(now);
    const expectedArgs = ["2026-10-09T22:00:00.000Z", "2026-10-10T22:00:00.000Z", expect.arrayContaining(["260977259132", "260974634555", "260975352801", "260979235018"])];
    expect(mocks.activity).toHaveBeenCalledWith(...expectedArgs);
    expect(mocks.followUps).toHaveBeenCalledWith(...expectedArgs);
    const alert = mocks.send.mock.calls[0][0];
    expect(alert.body).toContain("Report: 10 October 2026");
    expect(alert.body).toContain("New clients: 3");
    expect(alert.body).toContain("Payments verified: 1 | K1,750");
    expect(alert.body).not.toMatch(/Total leads|30d|Conversion:|Follow-ups due|Lost-lead signals|Highest-priority leads/);
    expect(result).toMatchObject({ sent: true, reportDate: "2026-10-10" });
    expect(mocks.query.mock.calls.find(([query]) => query.includes("INSERT INTO"))?.[1]).toEqual(["2026-10-11"]);
  });
  it("does not repeat a brief already sent on the same Zambia date", async () => {
    mocks.query.mockResolvedValue([]);
    expect(await runDailyManagementBrief(now)).toEqual({ sent: false, reason: "already_sent" });
    expect(mocks.activity).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("releases the original date for retry if the query fails, without reporting false zeros", async () => {
    mocks.followUps.mockRejectedValue(new Error("Database unavailable"));
    await expect(runDailyManagementBrief(now)).rejects.toThrow("Database unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM daily_management_briefs"), ["2026-10-11"]);
  });
  it("allows retry if the director's alert fails", async () => {
    mocks.send.mockResolvedValue([{ status: "fulfilled", value: { recipient: "Dr Kanyembo Ng'andwe", sent: true } }]);
    await expect(runDailyManagementBrief(now)).rejects.toThrow("eligible for retry");
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM daily_management_briefs"), ["2026-10-11"]);
  });
});
