import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelScheduledPublication, createPublication, getLatestPublication } from "@/lib/content-publications";
import { createContentSnapshot } from "@/lib/content-publication-snapshot";
import { getFacebookConnectionStatus } from "@/lib/facebook-connection";

const schema = z.object({ scheduledAt: z.string().datetime() });

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
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 60_000) {
      return NextResponse.json({ error: "Schedule the Facebook post at least one minute in the future." }, { status: 400 });
    }
    const facebook = await getFacebookConnectionStatus();
    if (!facebook.connected) return NextResponse.json({ error: "Connect the MedMinds Learning Centre Facebook Page before scheduling." }, { status: 409 });

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
    return NextResponse.json({ publication });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to schedule this Facebook post." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await cancelScheduledPublication(id);
  return NextResponse.json({ cancelled: true });
}
