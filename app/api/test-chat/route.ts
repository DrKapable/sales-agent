import { NextResponse } from "next/server";
import { z } from "zod";
import { replyToClient } from "@/lib/ai/sales-agent";
import { addMessage } from "@/lib/store";
import { getSetupState } from "@/lib/env";

const requestSchema = z.object({ sessionId: z.string().regex(/^sim-[a-f0-9-]{36}$/), message: z.string().trim().min(1).max(4000) });

export async function POST(request: Request) {
  if (!getSetupState().aiConfigured) return NextResponse.json({ error: "AI Gateway is not configured." }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a valid message." }, { status: 400 });
  await addMessage(parsed.data.sessionId, "user", parsed.data.message);
  try { return NextResponse.json({ reply: await replyToClient(parsed.data.sessionId, parsed.data.message, "simulator") }); }
  catch (error) { console.error("Simulator reply failed", error); return NextResponse.json({ error: "The assistant is temporarily unavailable." }, { status: 500 }); }
}

