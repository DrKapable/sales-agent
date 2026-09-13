import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelScheduledPublication, createPublication, getLatestPublication, markPublicationFailed, markPublicationRegistered } from "@/lib/content-publications";
import { createContentSnapshot } from "@/lib/content-publication-snapshot";
import { getFacebookConnectionStatus, publicOrigin } from "@/lib/facebook-connection";
import { deleteFacebookPublication, scheduleFacebookPublication, validateFacebookPublishingConnection } from "@/lib/facebook-publisher";

const schema = z.object({ scheduledAt: z.string().datetime() });
const MIN_SCHEDULE_AHEAD_MS = 10 * 60 * 1000;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json({ publication: await getLatestPublication(id) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid date and time." }, { status: 400 });
    const scheduledAt = new Date(parsed.data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + MIN_SCHEDULE_AHEAD_MS) {
      return NextResponse.json({ error: "Facebook requires scheduled Page posts to be at least 10 minutes in the future." }, { status: 400 });
    }

    const facebook = await getFacebookConnectionStatus();
    if (!facebook.connected) return NextResponse.json({ error: "Connect the MedMinds Learning Centre Facebook Page before scheduling." }, { status: 409 });
    await validateFacebookPublishingConnection();

    const existing = await getLatestPublication(id);
    if (existing?.status === "SCHEDULED" && existing.facebookPostId) {
      await deleteFacebookPublication(existing.facebookPostId);
      await cancelScheduledPublication(id);
    }

    const snapshot = await createContentSnapshot(request, id);
    const publication = await createPublication({
      postId: id,
      scheduledAt: scheduledAt.toISOString(),
      captionSnapshot: snapshot.post.body,
      sourceMediaUrl: snapshot.sourceMediaUrl,
      creativeVersion: snapshot.post.creativeVersion,
      mediaBase64: snapshot.mediaBase64,
      mediaMime: snapshot.mediaMime
    });

    const mediaUrl = `${publicOrigin(request)}/api/content/publication-image/${publication.id}`;
    try {
      const registered = await scheduleFacebookPublication(publication, mediaUrl, scheduledAt);
      const updated = await markPublicationRegistered(publication.id, registered.id);
      return NextResponse.json({ publication: updated || publication, delivery: "facebook-native" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Facebook scheduling failed.";
      await markPublicationFailed(publication.id, message);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to schedule this Facebook post." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const publication = await getLatestPublication(id);
    if (publication?.status === "SCHEDULED" && publication.facebookPostId) {
      await deleteFacebookPublication(publication.facebookPostId);
    }
    await cancelScheduledPublication(id);
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to cancel Facebook schedule." }, { status: 400 });
  }
}
