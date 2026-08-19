import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type ManifestIcon = { src?: string; sizes?: string; purpose?: string };
type ManifestScreenshot = { src?: string; sizes?: string; form_factor?: string };
type WebManifest = {
  name?: string;
  short_name?: string;
  description?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  prefer_related_applications?: boolean;
  icons?: ManifestIcon[];
  screenshots?: ManifestScreenshot[];
};

const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as WebManifest;
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

describe("PWA installation metadata", () => {
  it("keeps the core installability fields", () => {
    expect(manifest.name || manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/app");
    expect(manifest.scope).toBe("/");
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(manifest.display);
    expect(manifest.prefer_related_applications).toBe(false);

    const sizes = new Set((manifest.icons || []).map((icon) => icon.sizes));
    expect(sizes.has("192x192")).toBe(true);
    expect(sizes.has("512x512")).toBe(true);
    expect((manifest.icons || []).some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("provides promotional metadata for a richer Android install dialog", () => {
    expect(manifest.description?.length || 0).toBeGreaterThan(20);
    const mobileScreenshot = (manifest.screenshots || []).find((item) => item.form_factor === "narrow");
    expect(mobileScreenshot?.src).toBe("/pwa-screenshot-mobile.png");
    expect(mobileScreenshot?.sizes).toBe("691x1174");
    expect(existsSync(new URL(`../public${mobileScreenshot?.src}`, import.meta.url))).toBe(true);
  });
});

describe("PWA service worker privacy and lifecycle", () => {
  it("has a fetch handler required by the custom Chromium install flow", () => {
    expect(serviceWorker).toContain('self.addEventListener("fetch"');
  });

  it("keeps authenticated and API routes out of runtime caching", () => {
    expect(serviceWorker).toContain('pathname.startsWith("/admin")');
    expect(serviceWorker).toContain('pathname.startsWith("/api/")');
    expect(serviceWorker).toContain("networkOnlyNavigation");
  });

  it("pre-caches the richer install screenshot", () => {
    expect(serviceWorker).toContain('"/pwa-screenshot-mobile.png"');
  });
});
