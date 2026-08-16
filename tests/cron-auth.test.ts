import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

const original = process.env.CRON_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("cron authorization", () => {
  it("requires the exact CRON_SECRET bearer token", () => {
    process.env.CRON_SECRET = "secret-value";
    expect(isAuthorizedCronRequest(new Request("https://example.test", { headers: { authorization: "Bearer secret-value" } }))).toBe(true);
    expect(isAuthorizedCronRequest(new Request("https://example.test", { headers: { authorization: "Bearer wrong" } }))).toBe(false);
  });

  it("does not trust a spoofed Vercel cron user-agent", () => {
    process.env.CRON_SECRET = "secret-value";
    const request = new Request("https://example.test", { headers: { "user-agent": "vercel-cron/1.0" } });
    expect(isAuthorizedCronRequest(request)).toBe(false);
  });

  it("fails closed when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(new Request("https://example.test"))).toBe(false);
  });
});
