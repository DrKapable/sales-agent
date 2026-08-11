import { addMessage, listOffers } from "@/lib/store";
import { replyToClient, type SalesAgentResult } from "@/lib/ai/sales-agent";
import { wait } from "@/lib/timing";
import { sendWhatsAppText } from "@/lib/whatsapp";

function money(value: number) {
  return `K${Math.round(value).toLocaleString("en-US")}`;
}

async function verifiedFallback(text: string) {
  const message = text.trim();
  const lower = message.toLowerCase();

  if (/^(hi|hello|hey|hello\?|hey\?|\?)[.! ]*$/i.test(message)) {
    return "Hi 👋 I’m here. What would you like help with?";
  }
  if (/^(thanks|thank you|alright|okay|ok)[.! ]*$/i.test(message)) {
    return "You’re welcome. I’m here if you need anything else.";
  }

  if (/research/.test(lower) && /topic/.test(lower)) {
    return "Yes, we can help with research topic development. What programme or level are you doing?";
  }

  if (/proposal/.test(lower)) {
    const level = /ph\.?d|doctor/.test(lower) ? "phd"
      : /master/.test(lower) ? "masters"
      : /bachelor|undergrad/.test(lower) ? "bachelors"
      : /diploma/.test(lower) ? "diploma"
      : null;

    if (!level) return "Yes, we can help with research proposal writing. What level is it: diploma, bachelor’s, master’s or PhD?";

    const offer = (await listOffers(true)).find((item) => item.slug === `proposal-${level}`);
    if (offer && /how much|price|cost|charge/.test(lower) && offer.priceZmw != null) {
      if (offer.rushPriceZmw != null && offer.rushPriceZmw !== offer.priceZmw) {
        return `${offer.name} is ${money(offer.priceZmw)} on the standard timeline and ${money(offer.rushPriceZmw)} for rush work. What deadline are you working with?`;
      }
      return `${offer.name} is ${money(offer.priceZmw)} based on the current MedMinds price.`;
    }
    return `Yes, we can help with ${offer?.name.toLowerCase() || `${level} research proposal writing`}. What deadline are you working with?`;
  }

  if (/data analysis|analyse|analyze|statistics|statistical/.test(lower)) {
    return "Yes, we can help with data analysis. Is your study quantitative, qualitative or mixed methods?";
  }

  if (/pa gym|pagym/.test(lower)) {
    return "Yes, I can help with Pa Gym. Are you looking for theory, OSCE practice, or both?";
  }

  if (/dissertation|thesis/.test(lower)) {
    return "Yes, we can help with dissertation or thesis support. What level are you doing?";
  }

  return "I’m here and I can help with that. Could you tell me a little more about what you need?";
}

export async function generateWhatsAppReplyWithRecovery(phone: string, text: string): Promise<SalesAgentResult> {
  try {
    return await replyToClient(phone, text, "whatsapp");
  } catch (firstError) {
    console.warn("WhatsApp AI generation failed; retrying", { phoneSuffix: phone.slice(-4), error: firstError });
  }

  await wait(350);
  try {
    return await replyToClient(phone, text, "whatsapp");
  } catch (secondError) {
    console.error("WhatsApp AI generation retry failed; using verified fallback", { phoneSuffix: phone.slice(-4), error: secondError });
  }

  const reply = await verifiedFallback(text).catch(() => "I’m here and I can help. Could you send that request once more in a few words?");
  await addMessage(phone, "assistant", reply).catch((error) => {
    console.error("WhatsApp fallback could not be saved", { phoneSuffix: phone.slice(-4), error });
  });
  return { reply, referralNotification: null };
}

export async function sendWhatsAppTextWithRetry(phone: string, body: string) {
  try {
    return await sendWhatsAppText(phone, body);
  } catch (firstError) {
    console.warn("WhatsApp delivery failed; retrying", { phoneSuffix: phone.slice(-4), error: firstError });
  }
  await wait(600);
  return sendWhatsAppText(phone, body);
}
