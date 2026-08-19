import { NextResponse } from "next/server";
import { buildBusinessAnalytics } from "@/lib/business-analytics";
import { getFastBusinessSnapshot } from "@/lib/business-snapshot-fast";

function rangeDays(request: Request) {
  const raw = new URL(request.url).searchParams.get("days");
  const parsed = Number(raw || 90);
  if (!Number.isFinite(parsed)) return 90;
  return Math.max(7, Math.min(365, Math.round(parsed)));
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const snapshot = await getFastBusinessSnapshot();
    const analytics = buildBusinessAnalytics(snapshot, rangeDays(request));
    return NextResponse.json({ ...analytics, loadMs: Date.now() - startedAt });
  } catch (error) {
    console.error("Business analytics failed", { error });
    return NextResponse.json({ error: "Unable to load business analytics." }, { status: 500 });
  }
}
