import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ fetchMedia: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/whatsapp-media", () => ({ fetchWhatsAppMedia: mocks.fetchMedia }));
vi.mock("@/lib/session", () => ({ sessionCookieName: "session", verifySessionToken: mocks.verify }));
import { GET } from "@/app/api/admin/whatsapp-media/[mediaId]/route";
import { proxy } from "@/proxy";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockReturnValue(true);
  mocks.fetchMedia.mockImplementation(async () => ({ response: new Response("image-bytes"), info: { mimeType: "image/jpeg", fileSize: 11 } }));
});

describe("authenticated WhatsApp media preview", () => {
  it("streams inline images and downloads without exposing upstream URLs or tokens", async () => {
    const request = new NextRequest("https://sales.medmindslc.online/api/admin/whatsapp-media/4728232384111255?filename=image.jpg");
    const response = await GET(request, { params: Promise.resolve({ mediaId: "4728232384111255" }) });
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toContain('inline; filename="image.jpg"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe("image-bytes");
    request.nextUrl.searchParams.set("download", "1");
    const download = await GET(request, { params: Promise.resolve({ mediaId: "4728232384111255" }) });
    expect(download.headers.get("content-disposition")).toContain('attachment; filename="image.jpg"');
  });

  it("keeps media protected and permits authenticated same-origin playback", () => {
    const request = new NextRequest("https://sales.medmindslc.online/api/admin/whatsapp-media/4728232384111255");
    mocks.verify.mockReturnValue(false);
    expect(proxy(request).status).toBe(401);
    mocks.verify.mockReturnValue(true);
    expect(proxy(request).headers.get("content-security-policy")).toContain("media-src 'self'");
  });
});
