import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runDailyManagementBrief } from "@/lib/daily-brief";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const managementBrief = await runDailyManagementBrief();
    return NextResponse.json({ ok: true, managementBrief });
  } catch (error) {
    console.error("Daily management brief cron failed", { error });
    return NextResponse.json({ error: "Daily management brief failed." }, { status: 500 });
  }
}
