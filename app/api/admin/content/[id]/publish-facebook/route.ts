import { NextResponse } from "next/server";
import { claimPublication, createPublication, markPublicationFailed, markPublicationPublished } from "@/lib/content-publications";
import { createContentSnapshot } from "@/lib/content-publication-snapshot";
import { getFacebookConnectionStatus, publicOrigin } from "@/lib/facebook-connection";
import { publishFacebookPublication } from "@/lib/facebook-publisher";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const facebook = await getFacebookConnectionStatus();
  if (!facebook.connected) return NextResponse.json({ error: "Connect the MedMinds Learning Centre Facebook Page before publishing." }, { status: 409 });

  let publicationId: string | null = null;
  try {
    const snapshot = await createContentSnapshot(request, id);
    const created = await createPublication({
      postId: id,
      scheduledAt: null,
      captionSnapshot: snapshot.post.body,
      sourceMediaUrl: snapshot.sourceMediaUrl,
      creativeVersion: snapshot.post.creativeVersion,
      mediaBase64: snapshot.mediaBase64,
      mediaMime: snapshot.mediaMime
    });
    publicationId = created.id;
    const publication = await claimPublication(created.id);
    if (!publication) throw new Error("This Facebook publication could not be claimed for publishing.");
    const mediaUrl = `${publicOrigin(request)}/api/content/publication-image/${publication.id}`;
    const published = await publishFacebookPublication(publication, mediaUrl);
    const updated = await markPublicationPublished(publication.id, published.id);
    return NextResponse.json({ publication: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to publish on Facebook.";
    if (publicationId) await markPublicationFailed(publicationId, message).catch(() => null);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
