import { NextResponse } from "next/server";
import { runAutomatedFollowUps } from "@/lib/follow-up";
import { runDailyManagementBrief } from "@/lib/daily-brief";

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") || "";
  const secret = process.env.CRON_SECRET;
  const authorized = (secret && auth === `Bearer ${secret}`) || userAgent.includes("vercel-cron/1.0");
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [followUps, managementBrief] = await Promise.all([
      runAutomatedFollowUps(),
      runDailyManagementBrief().catch((error) => {
        console.error("Daily management brief failed", { error });
        return { sent: false, reason: "failed" };
      })
    ]);
    return NextResponse.json({ ok: true, followUps, managementBrief });
  } catch (error) {
    console.error("Automated follow-up cron failed", { error });
    return NextResponse.json({ error: "Follow-up run failed." }, { status: 500 });
  }
}
