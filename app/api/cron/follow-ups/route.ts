import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runAutomatedFollowUps } from "@/lib/follow-up";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const followUps = await runAutomatedFollowUps();
    return NextResponse.json({ ok: true, followUps });
  } catch (error) {
    console.error("Automated follow-up cron failed", { error });
    return NextResponse.json({ error: "Follow-up run failed." }, { status: 500 });
  }
}
