import type { ContentPublication } from "@/lib/content-publications";
import { getFacebookConnectionSecret } from "@/lib/facebook-connection";

async function connectionOrThrow() {
  const connection = await getFacebookConnectionSecret();
  if (!connection) throw new Error("Facebook Page is not connected. Reconnect MedMinds Learning Centre before publishing.");
  return connection;
}

function graphError(data: unknown, fallback: string) {
  const error = (data as { error?: { message?: string; code?: number; error_subcode?: number } })?.error;
  if (!error) return fallback;
  const code = error.code ? ` (Meta error ${error.code}${error.error_subcode ? `/${error.error_subcode}` : ""})` : "";
  return `${error.message || fallback}${code}`;
}

export async function validateFacebookPublishingConnection() {
  const connection = await connectionOrThrow();
  const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(connection.graphVersion)}/${encodeURIComponent(connection.pageId)}?fields=id,name&access_token=${encodeURIComponent(connection.accessToken)}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({})) as { id?: string; name?: string; error?: unknown };
  if (!response.ok || !data.id) throw new Error(graphError(data, `Facebook connection check returned HTTP ${response.status}.`));
  return { id: data.id, name: data.name || connection.pageName, graphVersion: connection.graphVersion };
}

export async function publishFacebookPublication(publication: ContentPublication, mediaUrl: string) {
  const connection = await connectionOrThrow();
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
  const data = await response.json().catch(() => ({})) as { id?: string; post_id?: string; error?: unknown };
  if (!response.ok) throw new Error(graphError(data, `Facebook returned HTTP ${response.status}.`));
  const id = data.post_id || data.id;
  if (!id) throw new Error("Facebook accepted the image but did not return a post identifier.");
  return { id };
}

export async function scheduleFacebookPublication(publication: ContentPublication, mediaUrl: string, scheduledAt: Date) {
  const connection = await connectionOrThrow();
  if (!mediaUrl.startsWith("https://")) throw new Error("Facebook requires a public HTTPS image URL.");
  const seconds = Math.floor(scheduledAt.getTime() / 1000);
  if (!Number.isFinite(seconds)) throw new Error("Invalid Facebook schedule time.");

  const base = `https://graph.facebook.com/${encodeURIComponent(connection.graphVersion)}/${encodeURIComponent(connection.pageId)}`;
  const response = await fetch(`${base}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      url: mediaUrl,
      caption: publication.captionSnapshot,
      published: "false",
      scheduled_publish_time: String(seconds),
      unpublished_content_type: "SCHEDULED",
      access_token: connection.accessToken
    }),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({})) as { id?: string; post_id?: string; error?: unknown };
  if (!response.ok) throw new Error(graphError(data, `Facebook scheduling returned HTTP ${response.status}.`));
  const id = data.post_id || data.id;
  if (!id) throw new Error("Facebook accepted the schedule but did not return a scheduled post identifier.");
  return { id };
}

export async function deleteFacebookPublication(facebookPostId: string) {
  const connection = await connectionOrThrow();
  const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(connection.graphVersion)}/${encodeURIComponent(facebookPostId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: connection.accessToken }),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({})) as { success?: boolean; error?: unknown };
  if (!response.ok || data.success === false) throw new Error(graphError(data, `Facebook could not cancel the scheduled post (HTTP ${response.status}).`));
  return true;
}
