import { NextResponse } from "next/server";
import { z } from "zod";
import { replyToClient } from "@/lib/ai/sales-agent";
import { captureNaturalConversationFacts } from "@/lib/natural-conversation-memory";
import { casualConversationFallback, isCasualConversationTurn } from "@/lib/conversation-smalltalk";
import { addMessage } from "@/lib/store";
import { getSetupState } from "@/lib/env";
import { allowRequest } from "@/lib/rate-limit";

const requestSchema = z.object({ sessionId: z.string().regex(/^sim-[a-f0-9-]{36}$/), message: z.string().trim().min(1).max(4000) });

export async function POST(request: Request) {
  if (!getSetupState().simulatorEnabled) return NextResponse.json({ error: "The public simulator is disabled." }, { status: 503 });
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(`simulator:${clientIp}`)) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a valid message." }, { status: 400 });

  await addMessage(parsed.data.sessionId, "user", parsed.data.message);
  if (!isCasualConversationTurn(parsed.data.message)) {
    await captureNaturalConversationFacts(parsed.data.sessionId, parsed.data.message, "simulator").catch(() => undefined);
  }

  try {
    const result = await replyToClient(parsed.data.sessionId, parsed.data.message, "simulator");
    return NextResponse.json({ reply: result.reply });
  } catch (error) {
    console.error("Simulator reply failed", error);
    if (isCasualConversationTurn(parsed.data.message)) {
      const reply = casualConversationFallback(parsed.data.message);
      await addMessage(parsed.data.sessionId, "assistant", reply).catch(() => undefined);
      return NextResponse.json({ reply, recovered: true });
    }
    return NextResponse.json({ error: "The assistant is temporarily unavailable." }, { status: 500 });
  }
}
