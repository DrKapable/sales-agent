import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const enhancer = readFileSync(join(root, "components/mobile-admin-enhancer.tsx"), "utf8");
const mobileCss = readFileSync(join(root, "app/admin-mobile-v8.css"), "utf8");

describe("mobile inbox client search", () => {
  it("keeps search accessible from an open client conversation", () => {
    expect(enhancer).toContain('className="mobileClientSearchButton"');
    expect(enhancer).toContain('aria-label="Search clients"');
    expect(enhancer).toContain('document.querySelector<HTMLInputElement>(".leadToolbar input")');
    expect(enhancer).toContain("setChatOpen(false)");
  });

  it("styles the focused-chat search action for phone layouts", () => {
    expect(mobileCss).toContain(".dashboard.mobileChatOpen .mobileClientSearchButton");
    expect(mobileCss).toContain("grid-template-columns:38px minmax(0,1fr) 144px");
  });
});