import { NextResponse } from "next/server";
import { z } from "zod";
import { replyToClient, type SalesAgentResult } from "@/lib/ai/sales-agent";
import { addMessage, getConversation, listOffers } from "@/lib/store";
import { getSetupState } from "@/lib/env";
import { allowRequest } from "@/lib/rate-limit";
import { sendWhatsAppText } from "@/lib/whatsapp";

const requestSchema = z.object({
  sessionId: z.string().regex(/^web-[a-f0-9-]{36}$/),
  whatsappNumber: z.string().trim().min(8).max(40),
  message: z.string().trim().min(1).max(4000)
});

function normalizeWhatsAppNumber(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `260${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function money(value: number) {
  return `K${Math.round(value).toLocaleString("en-US")}`;
}

async function verifiedFallback(message: string) {
  const ignored = new Set(["the", "and", "for", "with", "how", "much", "price", "cost", "service", "services", "writing", "level", "want", "need", "about"]);
  const terms = message.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !ignored.has(term));
  if (!terms.length) return null;
  const ranked = (await listOffers(true)).map((offer) => {
    const haystack = `${offer.name} ${offer.slug} ${offer.category} ${offer.description} ${offer.features.join(" ")}`.toLowerCase().replace(/[’']/g, "");
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    return { offer, score };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < Math.min(2, terms.length)) return null;
  const { offer } = best;
  if (/how much|price|cost|charge/i.test(message) && offer.priceZmw != null) {
    if (offer.rushPriceZmw != null && offer.rushPriceZmw !== offer.priceZmw) {
      return `${offer.name} is ${money(offer.priceZmw)} on the standard timeline and ${money(offer.rushPriceZmw)} for rush work. If you tell me your deadline, I can help identify which applies.`;
    }
    return `${offer.name} is ${money(offer.priceZmw)} based on the currently approved MedMinds pricing.`;
  }
  if (offer.description) return `${offer.name}: ${offer.description}`;
  return null;
}

async function recoverStoredReply(phone: string) {
  try {
    const history = await getConversation(phone);
    const last = history.at(-1);
    return last?.role === "assistant" ? last.content : null;
  } catch {
    return null;
  }
}

async function sendReferralNotification(result: SalesAgentResult) {
  if (!result.referralNotification || !getSetupState().whatsappConfigured) return;
  try {
    await sendWhatsAppText(result.referralNotification.phone, result.referralNotification.body);
  } catch (error) {
    console.error("Public chat referral notification failed", { recipient: result.referralNotification.recipientName, error });
  }
}

export async function POST(request: Request) {
  if (!getSetupState().aiConfigured) return NextResponse.json({ error: "The MedMinds assistant is temporarily unavailable." }, { status: 503 });
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(`public-chat:${clientIp}`, 30, 10 * 60 * 1000)) return NextResponse.json({ error: "You have sent several messages quickly. Please try again shortly." }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a valid message and WhatsApp number." }, { status: 400 });

  const phone = normalizeWhatsAppNumber(parsed.data.whatsappNumber);
  if (!phone) return NextResponse.json({ error: "Please enter a valid WhatsApp number including country code, for example +260..." }, { status: 400 });

  await addMessage(phone, "user", parsed.data.message);
  let result: SalesAgentResult | null = null;
  try {
    result = await replyToClient(phone, parsed.data.message, "simulator");
  } catch (firstError) {
    console.warn("Public chat generation failed; attempting recovery", { phoneSuffix: phone.slice(-4), error: firstError });
    const storedReply = await recoverStoredReply(phone);
    if (storedReply) return NextResponse.json({ reply: storedReply });
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      result = await replyToClient(phone, parsed.data.message, "simulator");
    } catch (secondError) {
      console.error("Public chat retry failed", { phoneSuffix: phone.slice(-4), error: secondError });
      const fallback = await verifiedFallback(parsed.data.message).catch(() => null);
      const reply = fallback || "I had a brief connection problem, but your WhatsApp contact is saved. Please send that message once more and I’ll continue from here.";
      await addMessage(phone, "assistant", reply).catch(() => undefined);
      return NextResponse.json({ reply, recovered: true });
    }
  }

  await sendReferralNotification(result);
  return NextResponse.json({ reply: result.reply });
}
