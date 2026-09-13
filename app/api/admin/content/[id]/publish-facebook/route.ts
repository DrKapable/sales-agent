import { NextResponse } from "next/server";
import { createPublication, getLatestPublication } from "@/lib/content-publications";
import { createContentSnapshot } from "@/lib/content-publication-snapshot";
import { getFacebookConnectionStatus } from "@/lib/facebook-connection";
import { validateFacebookPublishingConnection } from "@/lib/facebook-publisher";
import { publishQueuedPublication } from "@/lib/facebook-publication-runner";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const facebook = await getFacebookConnectionStatus();
    if (!facebook.connected) return NextResponse.json({ error: "Connect the MedMinds Learning Centre Facebook Page before publishing." }, { status: 409 });
    await validateFacebookPublishingConnection();

    const existing = await getLatestPublication(id);
    if (existing?.status === "SCHEDULED" && existing.facebookPostId) {
      return NextResponse.json({ error: "This post is already scheduled directly on Facebook. Cancel the schedule before using Post now to avoid a duplicate post." }, { status: 409 });
    }

    const snapshot = await createContentSnapshot(request, id);
    const publication = await createPublication({
      postId: id,
      scheduledAt: null,
      captionSnapshot: snapshot.post.body,
      sourceMediaUrl: snapshot.sourceMediaUrl,
      creativeVersion: snapshot.post.creativeVersion,
      mediaBase64: snapshot.mediaBase64,
      mediaMime: snapshot.mediaMime
    });
    const result = await publishQueuedPublication(request, publication.id);
    if (result.status !== "published") return NextResponse.json({ error: result.detail || "Facebook publishing failed.", result }, { status: 502 });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to publish this Facebook post." }, { status: 400 });
  }
}
