import { sanitizeWhatsAppApiError } from "@/lib/whatsapp";

function mediaConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  if (!token || !version) throw new Error("WhatsApp media access is not configured.");
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("Invalid WhatsApp Graph version.");
  return { token, version };
}

export type WhatsAppMediaInfo = {
  id: string;
  url: string;
  mimeType: string | null;
  fileSize: number | null;
};

export async function getWhatsAppMediaInfo(mediaId: string): Promise<WhatsAppMediaInfo> {
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(mediaId)) throw new Error("Invalid WhatsApp media ID.");
  const { token, version } = mediaConfig();
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${token}` }
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`WhatsApp media lookup returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(raw))}`);
  const data = JSON.parse(raw) as { id?: string; url?: string; mime_type?: string; file_size?: number };
  if (!data.url) throw new Error("WhatsApp media lookup did not return a download URL.");
  return {
    id: data.id || mediaId,
    url: data.url,
    mimeType: data.mime_type || null,
    fileSize: typeof data.file_size === "number" ? data.file_size : null
  };
}

export async function fetchWhatsAppMedia(mediaId: string) {
  const { token } = mediaConfig();
  const info = await getWhatsAppMediaInfo(mediaId);
  const response = await fetch(info.url, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok || !response.body) throw new Error(`WhatsApp media download returned ${response.status}.`);
  return { response, info };
}
