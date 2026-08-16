import { NextResponse } from "next/server";
import { listActiveLeads } from "@/lib/chat-lifecycle";

export async function GET() {
  const leads = await listActiveLeads();
  return NextResponse.json(leads, {
    headers: {
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
