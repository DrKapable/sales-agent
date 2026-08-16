import { NextRequest, NextResponse } from "next/server";
import { fetchWhatsAppMedia } from "@/lib/whatsapp-media";

function safeFilename(value: string | null, mediaId: string) {
  const fallback = `whatsapp-attachment-${mediaId.slice(-8)}`;
  const leaf = (value || fallback).replaceAll("\\", "/").split("/").pop() || fallback;
  return leaf.replace(/[\r\n"\\]+/g, "_").replace(/[^\x20-\x7E]+/g, "_").trim().slice(0, 180) || fallback;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  try {
    const { response, info } = await fetchWhatsAppMedia(mediaId);
    const filename = safeFilename(request.nextUrl.searchParams.get("filename"), mediaId);
    const download = request.nextUrl.searchParams.get("download") === "1";
    const headers = new Headers();
    headers.set("Content-Type", info.mimeType || response.headers.get("content-type") || "application/octet-stream");
    headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set("Cache-Control", "private, no-store, max-age=0");
    const length = response.headers.get("content-length") || (info.fileSize != null ? String(info.fileSize) : null);
    if (length) headers.set("Content-Length", length);
    return new NextResponse(response.body, { status: 200, headers });
  } catch (error) {
    console.error("Admin WhatsApp attachment fetch failed", { mediaIdSuffix: mediaId.slice(-6), error });
    return NextResponse.json({ error: "This WhatsApp attachment is no longer available from Meta or could not be downloaded." }, { status: 502 });
  }
}
