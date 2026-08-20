import { after, NextResponse } from "next/server";
import { z } from "zod";
import { replyToClient, type SalesAgentResult } from "@/lib/ai/sales-agent";
import { captureConversationAnswer, repairConversationReply } from "@/lib/conversation-continuity";
import { casualConversationFallback, isCasualConversationTurn } from "@/lib/conversation-smalltalk";
import { handleResearchSalesFlow } from "@/lib/research-sales-flow";
import { maybeEscalateResearchService } from "@/lib/research-service-escalation";
import { rewriteLatestUnsentAssistantMessage } from "@/lib/outgoing-message-rewrite";
import { addMessage, getConversation, getOrCreateLead, updateLead } from "@/lib/store";
import { getAiModelCandidates, getSetupState } from "@/lib/env";
import { verifiedConversationFallback } from "@/lib/recovery-reply";
import { allowRequest } from "@/lib/rate-limit";
import { wait } from "@/lib/timing";
import { sendTeamCopies } from "@/lib/team-notifications";
import { notifyDirectorOfNewClient } from "@/lib/new-client-alert";

const requestSchema = z.object({
  sessionId: z.string().regex(/^web-[a-f0-9-]{36}$/),
  name: z.string().trim().min(2).max(120),
  whatsappNumber: z.string().trim().min(8).max(40),
  message: z.string().trim().min(1).max(4000)
});

function normalizeWhatsAppNumber(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `260${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

async function sendReferralNotification(result: SalesAgentResult) {
  if (!result.referralNotification || !getSetupState().whatsappConfigured) return;
  try {
    await sendTeamCopies({
      heading: "Client referral",
      body: result.referralNotification.body,
      primary: {
        name: result.referralNotification.recipientName,
        phone: result.referralNotification.phone
      }
    });
  } catch (error) {
    console.error("Public chat referral notification failed", { recipient: result.referralNotification.recipientName, error });
  }
}

async function generateWithFailover(phone: string, message: string) {
  const models = getAiModelCandidates();
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      return await replyToClient(phone, message, "simulator", model);
    } catch (error) {
      console.warn("Public chat AI generation failed", { phoneSuffix: phone.slice(-4), model, attempt: index + 1, error });
      if (index < models.length - 1) await wait(250);
    }
  }
  return null;
}

export async function POST(request: Request) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(`public-chat:${clientIp}`, 30, 10 * 60 * 1000)) return NextResponse.json({ error: "You have sent several messages quickly. Please try again shortly." }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter your name, a valid WhatsApp number and a message." }, { status: 400 });

  const phone = normalizeWhatsAppNumber(parsed.data.whatsappNumber);
  if (!phone) return NextResponse.json({ error: "Please enter a valid WhatsApp number including country code, for example +260..." }, { status: 400 });

  const previousHistory = await getConversation(phone, 1);
  const firstEverClientMessage = previousHistory.length === 0;
  await updateLead(phone, { name: parsed.data.name });
  await addMessage(phone, "user", parsed.data.message);

  const recentAssistantReplies = (await getConversation(phone, 16).catch(() => []))
    .filter((message) => message.role === "assistant")
    .slice(-6)
    .map((message) => message.content);

  const queueNewClientAlert = () => {
    if (!firstEverClientMessage) return;
    after(async () => {
      const currentLead = await getOrCreateLead(phone, "simulator");
      const alerted = await notifyDirectorOfNewClient({ lead: currentLead, firstMessage: parsed.data.message, source: "website" });
      console.info("Website new client director alert processed", { phoneSuffix: phone.slice(-4), alerted });
    });
  };

  // Keep genuine social chat out of qualification and continuity repair. The
  // model still sees the full conversation, so the business thread is preserved
  // and can resume naturally when the client returns to it.
  if (isCasualConversationTurn(parsed.data.message)) {
    const result = await generateWithFailover(phone, parsed.data.message);
    if (result) {
      queueNewClientAlert();
      return NextResponse.json({ reply: result.reply });
    }
    const reply = casualConversationFallback(parsed.data.message);
    await addMessage(phone, "assistant", reply).catch(() => undefined);
    queueNewClientAlert();
    return NextResponse.json({ reply, recovered: true });
  }

  await captureConversationAnswer(phone, parsed.data.message, "simulator").catch((error) => {
    console.warn("Website conversation answer memory could not be updated", { phoneSuffix: phone.slice(-4), error });
  });

  const finalizeSavedResult = async (result: SalesAgentResult) => {
    const repaired = repairConversationReply(result.reply, parsed.data.message, recentAssistantReplies);
    if (repaired === result.reply) return result;
    const rewritten = await rewriteLatestUnsentAssistantMessage({ phone, from: result.reply, to: repaired }).catch(() => false);
    return rewritten ? { ...result, reply: repaired } : result;
  };

  const researchSales = await handleResearchSalesFlow({ phone, text: parsed.data.message, source: "simulator" }).catch((error) => {
    console.warn("Website research sales flow could not be applied; continuing safely", { phoneSuffix: phone.slice(-4), error });
    return null;
  });
  if (researchSales) {
    queueNewClientAlert();
    const finalized = await finalizeSavedResult(researchSales);
    return NextResponse.json({ reply: finalized.reply });
  }

  const researchEscalation = await maybeEscalateResearchService({ phone, text: parsed.data.message, source: "simulator" });
  if (researchEscalation) {
    await addMessage(phone, "assistant", researchEscalation.reply).catch(() => undefined);
    const finalized = await finalizeSavedResult(researchEscalation);
    await sendReferralNotification(finalized);
    queueNewClientAlert();
    return NextResponse.json({ reply: finalized.reply });
  }

  const result = await generateWithFailover(phone, parsed.data.message);
  if (result) {
    const finalized = await finalizeSavedResult(result);
    await sendReferralNotification(finalized);
    queueNewClientAlert();
    return NextResponse.json({ reply: finalized.reply });
  }

  const fallback = await verifiedConversationFallback(phone, parsed.data.message).catch(() => "I'm here and I can help. Tell me a little more about what you need and I'll continue from there.");
  const reply = repairConversationReply(fallback, parsed.data.message, recentAssistantReplies);
  await addMessage(phone, "assistant", reply).catch(() => undefined);
  queueNewClientAlert();
  return NextResponse.json({ reply, recovered: true });
}
