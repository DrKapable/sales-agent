import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { syncExpleeHotLeads } from "@/lib/explee-hot-leads";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await syncExpleeHotLeads());
  } catch (error) {
    console.error("Explee hot-lead synchronization failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "Unable to synchronize Explee hot leads." }, { status: 502 });
  }
}
