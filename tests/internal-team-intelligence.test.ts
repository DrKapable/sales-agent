import { describe, expect, it } from "vitest";
import { canReadTeamData, canonicalTeamPhone } from "@/lib/internal-team-registry";
import { periodBounds } from "@/lib/internal-team-data";

describe("private staff identity boundaries", () => {
  it("matches complete Zambia WhatsApp numbers without suffix matching", () => {
    expect(canonicalTeamPhone("+260 977 259 132")).toBe("260977259132");
    expect(canonicalTeamPhone("0977259132")).toBe("260977259132");
    expect(canonicalTeamPhone("260977259132")).toBe("260977259132");
    expect(canonicalTeamPhone("259132")).not.toBe("260977259132");
  });
  it("gives staff only their authorised data categories", () => {
    expect(canReadTeamData("director", "finance")).toBe(true);
    expect(canReadTeamData("director", "leads")).toBe(true);
    expect(canReadTeamData("sales", "leads")).toBe(true);
    expect(canReadTeamData("sales", "finance")).toBe(false);
    expect(canReadTeamData("marketing", "marketing")).toBe(true);
    expect(canReadTeamData("marketing", "leads")).toBe(false);
    expect(canReadTeamData("support", "leads")).toBe(true);
    expect(canReadTeamData("support", "finance")).toBe(false);
  });
});

describe("Zambia reporting period boundaries", () => {
  const now=new Date("2026-10-16T21:15:00Z"); // 23:15 on 16 October in Lusaka
  it("starts today at 00:00 Lusaka time", () => {
    const p=periodBounds("today",now);
    expect(p.start).toBe("2026-10-15T22:00:00.000Z");
    expect(p.end).toBe("2026-10-16T22:00:00.000Z");
  });
  it("uses previous local calendar day for yesterday", () => {
    const p=periodBounds("yesterday",now);
    expect(p.start).toBe("2026-10-14T22:00:00.000Z");
    expect(p.end).toBe("2026-10-15T22:00:00.000Z");
  });
  it("covers seven local dates inclusive of today", () => {
    const p=periodBounds("last7",now);
    expect(p.start).toBe("2026-10-09T22:00:00.000Z");
    expect(p.end).toBe("2026-10-16T22:00:00.000Z");
  });
});
