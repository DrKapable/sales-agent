import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { syncHumanFollowUpQueue } from "@/lib/human-follow-ups";
import { runMaryAutomaticFollowUps } from "@/lib/mary-automatic-follow-ups";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const followUps = await syncHumanFollowUpQueue({ notifyDue: false });
    const mary = await runMaryAutomaticFollowUps();
    return NextResponse.json({ ok: true, followUps, mary });
  } catch (error) {
    console.error("Follow-up scheduler cron failed", { error });
    return NextResponse.json({ error: "Follow-up scheduling run failed." }, { status: 500 });
  }
}
