import { handleIncomingClientAttachment } from "@/lib/client-attachment-referral";
import { addMessage } from "@/lib/store";
import { replyToClient, type SalesAgentResult } from "@/lib/ai/sales-agent";
import { getAiModelCandidates } from "@/lib/env";
import { verifiedConversationFallback } from "@/lib/recovery-reply";
import { humanTextTypingDelayMs, wait } from "@/lib/timing";
import { sendWhatsAppText } from "@/lib/whatsapp";

export async function generateWhatsAppReplyWithRecovery(phone: string, text: string): Promise<SalesAgentResult> {
  const attachmentResult = await handleIncomingClientAttachment(phone, text);
  if (attachmentResult) return attachmentResult;

  const models = getAiModelCandidates();
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      return await replyToClient(phone, text, "whatsapp", model);
    } catch (error) {
      console.warn("WhatsApp AI generation failed", { phoneSuffix: phone.slice(-4), model, attempt: index + 1, error });
      if (index < models.length - 1) await wait(250);
    }
  }

  const reply = await verifiedConversationFallback(phone, text).catch(() => "I’m here and I can help. Tell me a little more about what you need and I’ll continue from there.");
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
