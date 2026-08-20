import { NextResponse } from "next/server";
import { z } from "zod";
import { replyToClient } from "@/lib/ai/sales-agent";
import { captureConversationAnswer, repairConversationReply } from "@/lib/conversation-continuity";
import { casualConversationFallback, isCasualConversationTurn } from "@/lib/conversation-smalltalk";
import { rewriteLatestUnsentAssistantMessage } from "@/lib/outgoing-message-rewrite";
import { addMessage, getConversation } from "@/lib/store";
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

  const recentAssistantReplies = (await getConversation(parsed.data.sessionId, 16).catch(() => []))
    .filter((message) => message.role === "assistant")
    .slice(-6)
    .map((message) => message.content);

  if (isCasualConversationTurn(parsed.data.message)) {
    try {
      const result = await replyToClient(parsed.data.sessionId, parsed.data.message, "simulator");
      return NextResponse.json({ reply: result.reply });
    } catch (error) {
      console.error("Simulator casual reply failed", error);
      const reply = casualConversationFallback(parsed.data.message);
      await addMessage(parsed.data.sessionId, "assistant", reply).catch(() => undefined);
      return NextResponse.json({ reply, recovered: true });
    }
  }

  await captureConversationAnswer(parsed.data.sessionId, parsed.data.message, "simulator").catch(() => undefined);
  try {
    const result = await replyToClient(parsed.data.sessionId, parsed.data.message, "simulator");
    const repaired = repairConversationReply(result.reply, parsed.data.message, recentAssistantReplies);
    if (repaired !== result.reply) {
      const rewritten = await rewriteLatestUnsentAssistantMessage({ phone: parsed.data.sessionId, from: result.reply, to: repaired }).catch(() => false);
      if (rewritten) return NextResponse.json({ reply: repaired });
    }
    return NextResponse.json({ reply: result.reply });
  }
  catch (error) { console.error("Simulator reply failed", error); return NextResponse.json({ error: "The assistant is temporarily unavailable." }, { status: 500 }); }
}
