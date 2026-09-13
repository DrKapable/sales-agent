import type { ContentPublication } from "@/lib/content-publications";
import { getFacebookConnectionSecret } from "@/lib/facebook-connection";

export async function publishFacebookPublication(publication: ContentPublication, mediaUrl: string) {
  const connection = await getFacebookConnectionSecret();
  if (!connection) throw new Error("Facebook Page is not connected. Reconnect MedMinds Learning Centre before publishing.");
  if (!mediaUrl.startsWith("https://")) throw new Error("Facebook requires a public HTTPS image URL.");

  const base = `https://graph.facebook.com/${encodeURIComponent(connection.graphVersion)}/${encodeURIComponent(connection.pageId)}`;
  const response = await fetch(`${base}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      url: mediaUrl,
      caption: publication.captionSnapshot,
      access_token: connection.accessToken
    }),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({})) as { id?: string; post_id?: string; error?: { message?: string; code?: number } };
  if (!response.ok) {
    const message = data.error?.message || `Facebook returned HTTP ${response.status}.`;
    throw new Error(data.error?.code ? `${message} (Meta error ${data.error.code})` : message);
  }
  const id = data.post_id || data.id;
  if (!id) throw new Error("Facebook accepted the image but did not return a post identifier.");
  return { id };
}
