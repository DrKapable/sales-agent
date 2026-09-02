import { handleIncomingClientAttachment } from "@/lib/client-attachment-referral";
import { captureNaturalConversationFacts } from "@/lib/natural-conversation-memory";
import { casualConversationFallback, isCasualConversationTurn } from "@/lib/conversation-smalltalk";
import { optimizeInboundLead, shapeMaryReply } from "@/lib/conversation-optimization";
import { rewriteLatestUnsentAssistantMessage } from "@/lib/outgoing-message-rewrite";
import { addMessage } from "@/lib/store";
import { replyToClient, type SalesAgentResult } from "@/lib/ai/sales-agent";
import { getAiModelCandidates } from "@/lib/env";
import { verifiedConversationFallback } from "@/lib/recovery-reply";
import { handleMaryPaymentFlow } from "@/lib/mary-payment-flow";
import { humanTextTypingDelayMs, wait } from "@/lib/timing";
import { sendWhatsAppText } from "@/lib/whatsapp";

async function generateCasualWhatsAppReply(phone: string, text: string): Promise<SalesAgentResult> {
  const models = getAiModelCandidates();
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
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

  // Explicit payment turns are handled by the verified Sampay/Research Portal
  // workflow before the general AI. This prevents Mary from falling back to
  // legacy personal-number instructions or treating screenshots as confirmation.
  const paymentResult = await handleMaryPaymentFlow({ phone, text, source: "whatsapp" }).catch((error) => {
    console.error("Mary payment workflow failed safely", { phoneSuffix: phone.slice(-4), error });
    return null;
  });
  if (paymentResult) return paymentResult;

  // Keep ordinary social turns conversational. The model still sees the full
  // transcript, so an unfinished sales journey is remembered without hijacking
  // greetings, thanks or normal small talk.
  if (isCasualConversationTurn(text)) return generateCasualWhatsAppReply(phone, text);

  const optimization = await optimizeInboundLead(phone, text, "whatsapp").catch((error) => {
    console.warn("Conversation optimization could not be applied; continuing safely", { phoneSuffix: phone.slice(-4), error });
    return null;
  });

  // Memory capture is deliberately non-verbal. It may save a natural short fact
  // such as Diploma or 2 weeks, but it never generates the client's reply.
  await captureNaturalConversationFacts(phone, text, "whatsapp").catch((error) => {
    console.warn("Natural conversation memory could not be updated; continuing safely", { phoneSuffix: phone.slice(-4), error });
  });

  const recentAssistantReplies = optimization?.recentAssistantReplies ?? [];
  const models = getAiModelCandidates();
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const result = await replyToClient(phone, text, "whatsapp", model);
      if (!optimization) return result;

      // Keep only lightweight presentation safeguards here. Do not rewrite the
      // meaning of Mary's response with canned qualification sentences.
      const shaped = shapeMaryReply(result.reply, text, optimization.analysis, recentAssistantReplies);
      if (shaped === result.reply) return result;

      const rewritten = await rewriteLatestUnsentAssistantMessage({ phone, from: result.reply, to: shaped }).catch(() => false);
      return rewritten ? { ...result, reply: shaped } : result;
    } catch (error) {
      console.warn("WhatsApp AI generation failed", { phoneSuffix: phone.slice(-4), model, attempt: index + 1, error });
      if (index < models.length - 1) await wait(250);
    }
  }

  const fallback = await verifiedConversationFallback(phone, text).catch(() => "I’m here and I can help. Tell me what’s on your mind and we’ll continue from there.");
  const reply = optimization
    ? shapeMaryReply(fallback, text, optimization.analysis, recentAssistantReplies)
    : fallback;
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