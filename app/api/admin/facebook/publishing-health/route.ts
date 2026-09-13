import { NextResponse } from "next/server";
import { listDuePublications } from "@/lib/content-publications";
import { getFacebookConnectionStatus } from "@/lib/facebook-connection";
import { validateFacebookPublishingConnection } from "@/lib/facebook-publisher";

export async function GET() {
  const facebook = await getFacebookConnectionStatus();
  const due = await listDuePublications(100);
  let pageReachable = false;
  let pageError: string | null = null;
  if (facebook.connected) {
    try {
      await validateFacebookPublishingConnection();
      pageReachable = true;
    } catch (error) {
      pageError = error instanceof Error ? error.message : "Facebook Page validation failed.";
    }
  }
  return NextResponse.json({
    facebookConnected: facebook.connected,
    pageReachable,
    pageError,
    cronConfigured: Boolean(process.env.CRON_SECRET?.trim()),
    fallbackDueCount: due.length,
    oldestFallbackDueAt: due[0]?.scheduledAt || null,
    primarySchedulingMode: "facebook-native"
  });
}
