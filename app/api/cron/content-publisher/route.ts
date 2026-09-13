import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { claimPublication, listDuePublications, markPublicationFailed, markPublicationPublished } from "@/lib/content-publications";
import { publicOrigin } from "@/lib/facebook-connection";
import { publishFacebookPublication } from "@/lib/facebook-publisher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const due = await listDuePublications(20);
  const results: Array<{ id: string; status: "published" | "failed" | "skipped"; detail?: string }> = [];
  for (const item of due) {
    const publication = await claimPublication(item.id);
    if (!publication) {
      results.push({ id: item.id, status: "skipped" });
      continue;
    }
    try {
      const mediaUrl = `${publicOrigin(request)}/api/content/publication-image/${publication.id}`;
      const published = await publishFacebookPublication(publication, mediaUrl);
      await markPublicationPublished(publication.id, published.id);
      results.push({ id: publication.id, status: "published", detail: published.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Facebook publishing failed.";
      await markPublicationFailed(publication.id, message);
      results.push({ id: publication.id, status: "failed", detail: message });
    }
  }
  return NextResponse.json({ checked: due.length, results, generatedAt: new Date().toISOString() });
}
