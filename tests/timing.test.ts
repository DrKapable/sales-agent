import { describe, expect, it } from "vitest";
import { humanReplyDelayMs } from "../lib/timing";

describe("human reply timing", () => {
  it("targets a natural delay between 6 and 15 seconds", () => {
    expect(humanReplyDelayMs(0, 0)).toBe(6000);
    expect(humanReplyDelayMs(0, 1)).toBe(15000);
  });

  it("subtracts time already spent generating the reply", () => {
    expect(humanReplyDelayMs(5000, 0)).toBe(1000);
    expect(humanReplyDelayMs(16000, 1)).toBe(0);
  });
});
