import { handleIncomingClientAttachment } from "@/lib/client-attachment-referral";
import { captureConversationAnswer, repairConversationReply } from "@/lib/conversation-continuity";
import { casualConversationFallback, isCasualConversationTurn } from "@/lib/conversation-smalltalk";
import { optimizeInboundLead, shapeMaryReply } from "@/lib/conversation-optimization";
import { researchCampaignOpening } from "@/lib/research-campaign-conversion";
import { handleResearchSalesFlow } from "@/lib/research-sales-flow";
import { maybeEscalateResearchService } from "@/lib/research-service-escalation";
import { rewriteLatestUnsentAssistantMessage } from "@/lib/outgoing-message-rewrite";
import { addMessage, updateLead } from "@/lib/store";
import { replyToClient, type SalesAgentResult } from "@/lib/ai/sales-agent";
import { getAiModelCandidates } from "@/lib/env";
import { verifiedConversationFallback } from "@/lib/recovery-reply";
import { humanTextTypingDelayMs, wait } from "@/lib/timing";
import { sendWhatsAppText } from "@/lib/whatsapp";

async function generateCasualWhatsAppReply(phone: string, text: string): Promise<SalesAgentResult> {
  const models = getAiModelCandidates();
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      // Small talk deliberately bypasses sales qualification/continuity rewriting.
      // replyToClient still receives the full transcript, so Mary can answer naturally
      // without forgetting who the client is or losing the commercial journey.
      return await replyToClient(phone, text, "whatsapp", model);
    } catch (error) {
      console.warn("Casual WhatsApp reply generation failed", { phoneSuffix: phone.slice(-4), model, attempt: index + 1, error });
      if (index < models.length - 1) await wait(250);
    }
  }

  const reply = casualConversationFallback(text);
  await addMessage(phone, "assistant", reply).catch(() => undefined);
  return { reply, referralNotification: null, documentIds: [] };
}

export async function generateWhatsAppReplyWithRecovery(phone: string, text: string): Promise<SalesAgentResult> {
  const attachmentResult = await handleIncomingClientAttachment(phone, text);
  if (attachmentResult) return attachmentResult;

  // Social conversation should feel like a normal WhatsApp chat. Do not let an
  // unfinished sales question turn "How are you?" into a CRM/qualification reply.
  if (isCasualConversationTurn(text)) return generateCasualWhatsAppReply(phone, text);

  const optimization = await optimizeInboundLead(phone, text, "whatsapp").catch((error) => {
    console.warn("Conversation optimization could not be applied; continuing safely", { phoneSuffix: phone.slice(-4), error });
    return null;
  });

  await captureConversationAnswer(phone, text, "whatsapp").catch((error) => {
    console.warn("Conversation answer memory could not be updated; continuing safely", { phoneSuffix: phone.slice(-4), error });
  });

  const recentAssistantReplies = optimization?.recentAssistantReplies ?? [];
  const finalizeSavedResult = async (result: SalesAgentResult) => {
    const repaired = repairConversationReply(result.reply, text, recentAssistantReplies);
    if (repaired === result.reply) return result;
    const rewritten = await rewriteLatestUnsentAssistantMessage({ phone, from: result.reply, to: repaired }).catch(() => false);
    return rewritten ? { ...result, reply: repaired } : result;
  };

  // The two active research ads generate low-information openers such as
  // "Can I get more info on this?". Keep the first reply short and easy to answer.
  const firstClientTurn = (optimization?.clientMessageCount ?? 1) <= 1;
  const campaignOpening = researchCampaignOpening(text, firstClientTurn);
  if (campaignOpening) {
    await updateLead(phone, { serviceInterest: campaignOpening.serviceInterest, status: "NEW LEAD" }).catch((error) => {
      console.warn("Unable to label research campaign lead", { phoneSuffix: phone.slice(-4), error });
    });
    await addMessage(phone, "assistant", campaignOpening.reply).catch((error) => {
      console.error("Research campaign opening reply could not be saved", { phoneSuffix: phone.slice(-4), error });
    });
    return finalizeSavedResult({ reply: campaignOpening.reply, referralNotification: null, documentIds: [] });
  }

  // Research support is a sales journey before it is a fulfilment handoff.
  // Keep Mary in the conversation while she establishes the exact deliverable,
  // academic level and deadline, then prepare a catalogue-backed quotation when appropriate.
  const researchSales = await handleResearchSalesFlow({ phone, text, source: "whatsapp" }).catch((error) => {
    console.warn("Research sales flow could not be applied; continuing safely", { phoneSuffix: phone.slice(-4), error });
    return null;
  });
  if (researchSales) return finalizeSavedResult(researchSales);

  const researchEscalation = await maybeEscalateResearchService({ phone, text, source: "whatsapp" });
  if (researchEscalation) {
    await addMessage(phone, "assistant", researchEscalation.reply).catch((error) => {
      console.error("Research escalation reply could not be saved", { phoneSuffix: phone.slice(-4), error });
    });
    return finalizeSavedResult(researchEscalation);
  }

  const models = getAiModelCandidates();
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const result = await replyToClient(phone, text, "whatsapp", model);
      if (!optimization) return finalizeSavedResult(result);
      const shaped = shapeMaryReply(result.reply, text, optimization.analysis, recentAssistantReplies);
      const repaired = repairConversationReply(shaped, text, recentAssistantReplies);
      if (repaired === result.reply) return result;

      const rewritten = await rewriteLatestUnsentAssistantMessage({ phone, from: result.reply, to: repaired }).catch(() => false);
      return rewritten ? { ...result, reply: repaired } : result;
    } catch (error) {
      console.warn("WhatsApp AI generation failed", { phoneSuffix: phone.slice(-4), model, attempt: index + 1, error });
      if (index < models.length - 1) await wait(250);
    }
  }

  const fallback = await verifiedConversationFallback(phone, text).catch(() => "I’m here and I can help. Tell me a little more about what you need and I’ll continue from there.");
  const shapedFallback = optimization
    ? shapeMaryReply(fallback, text, optimization.analysis, recentAssistantReplies)
    : fallback;
  const reply = repairConversationReply(shapedFallback, text, recentAssistantReplies);
  await addMessage(phone, "assistant", reply).catch((error) => {
    console.error("WhatsApp fallback could not be saved", { phoneSuffix: phone.slice(-4), error });
  });
  return { reply, referralNotification: null, documentIds: [] };
}

export async function sendWhatsAppTextWithRetry(phone: string, body: string, phoneNumberId?: string | null) {
  const typingDelayMs = humanTextTypingDelayMs(body);
  console.info("Mary human-like typing delay", {
    phoneSuffix: phone.slice(-4),
    characters: body.trim().length,
    delayMs: typingDelayMs
  });
  await wait(typingDelayMs);

  try {
    return await sendWhatsAppText(phone, body, phoneNumberId ?? undefined);
  } catch (firstError) {
    console.warn("WhatsApp delivery failed; retrying", { phoneSuffix: phone.slice(-4), error: firstError });
  }
  await wait(600);
  return sendWhatsAppText(phone, body, phoneNumberId ?? undefined);
}
