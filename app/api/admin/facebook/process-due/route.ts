import { NextResponse } from "next/server";
import { processDueFacebookPublications } from "@/lib/facebook-publication-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    return NextResponse.json(await processDueFacebookPublications(request, 20));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process overdue Facebook posts." }, { status: 500 });
  }
}
