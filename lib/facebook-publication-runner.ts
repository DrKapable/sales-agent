import { claimPublication, listDuePublications, markPublicationFailed, markPublicationPublished } from "@/lib/content-publications";
import { publicOrigin } from "@/lib/facebook-connection";
import { publishFacebookPublication } from "@/lib/facebook-publisher";

export type PublicationRunResult = { id: string; status: "published" | "failed" | "skipped"; detail?: string };

export async function publishQueuedPublication(request: Request, publicationId: string): Promise<PublicationRunResult> {
  const publication = await claimPublication(publicationId);
  if (!publication) return { id: publicationId, status: "skipped" };
  try {
    const mediaUrl = `${publicOrigin(request)}/api/content/publication-image/${publication.id}`;
    const published = await publishFacebookPublication(publication, mediaUrl);
    await markPublicationPublished(publication.id, published.id);
    return { id: publication.id, status: "published", detail: published.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook publishing failed.";
    await markPublicationFailed(publication.id, message);
    return { id: publication.id, status: "failed", detail: message };
  }
}

export async function processDueFacebookPublications(request: Request, limit = 20) {
  const due = await listDuePublications(limit);
  const results: PublicationRunResult[] = [];
  for (const item of due) results.push(await publishQueuedPublication(request, item.id));
  return { checked: due.length, results, generatedAt: new Date().toISOString() };
}
