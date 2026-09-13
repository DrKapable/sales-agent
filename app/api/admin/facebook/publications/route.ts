import { NextResponse } from "next/server";
import { listRecentPublications } from "@/lib/content-publications";

export async function GET() {
  return NextResponse.json({ publications: await listRecentPublications(200) });
}
