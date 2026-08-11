import { NextResponse } from "next/server";
import { runAutomatedFollowUps } from "@/lib/follow-up";

export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") || "";
  const secret = process.env.CRON_SECRET;
  const authorized = (secret && auth === `Bearer ${secret}`) || userAgent.includes("vercel-cron/1.0");
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await runAutomatedFollowUps();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Automated follow-up cron failed", { error });
    return NextResponse.json({ error: "Follow-up run failed." }, { status: 500 });
  }
}
