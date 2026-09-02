import { addMessage, getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";
import { resolveCataloguePrice } from "@/lib/catalogue-pricing";
import { getLatestPreparedQuotation } from "@/lib/prepared-quotation";
import { sendSalesPipelineCopies } from "@/lib/team-notifications";
import {
  AI_RESEARCH_COURSE_PRICE_ZMW,
  AI_RESEARCH_COURSE_URL,
  checkResearchPayment,
  createResearchPaymentRequest,
  latestPaymentTokenForLead,
} from "@/lib/research-payments";
import type { SalesAgentResult } from "@/lib/ai/sales-agent";

const PAYMENT_TOPIC = /\b(pay|payment|payment link|checkout|sampay|mobile money|momo|bank card|debit card|credit card|card payment|pay by card|pay with card|payment method)\b/i;
const CREATE_INTENT = /\b(ready to pay|want to pay|make payment|proceed with payment|send (?:me )?(?:the )?(?:payment )?link|create (?:a )?(?:payment )?link|how (?:do|can) i pay|where (?:do|can) i pay)\b/i;
const PAID_INTENT = /\b(i(?:'|’)ve paid|i have paid|paid already|payment (?:is )?(?:done|made|completed|successful)|completed (?:the )?payment|just paid)\b/i;
const COURSE_CONTEXT = /\b(ai[- ]enhanced research writing|ai[- ]assisted research proposal writing|research writing course|proposal writing course|research course|self[- ]directed|self[- ]paced)\b/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+?260|0)\d{9}\b/;

function asResult(reply: string): SalesAgentResult {
  return { reply, referralNotification: null, documentIds: [] };
}

function money(value: number) {
  return `K${Number(value).toLocaleString("en-ZM", { maximumFractionDigits: 2 })}`;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") && digits.length === 10 ? `260${digits.slice(1)}` : digits;
}

async function reply(phone: string, body: string) {
  await addMessage(phone, "assistant", body);
  return asResult(body);
}

export async function handleMaryPaymentFlowV2(input: {
  phone: string;
  text: string;
  source: "whatsapp" | "simulator";
}): Promise<SalesAgentResult | null> {
  const latest = input.text.trim();
  if (!PAYMENT_TOPIC.test(latest) && !PAID_INTENT.test(latest)) return null;

  let lead = await getOrCreateLead(input.phone, input.source);
  const history = await getConversation(input.phone, 80).catch(() => []);
  const clientMessages = history.filter((m) => m.role === "user").map((m) => m.content);
  const transcript = [...clientMessages, latest].join("\n");
  const context = `${lead.serviceInterest || ""} ${lead.packageName || ""} ${transcript}`;
  const course = COURSE_CONTEXT.test(context);

  if (PAID_INTENT.test(latest)) {
    const token = await latestPaymentTokenForLead(lead);
    if (!token) {
      if (course) {
        return reply(input.phone, "Thank you. If you paid through the course checkout, please allow the Sampay checkout to finish processing. I can only confirm payment after MedMinds/Sampay records it as successful. If access does not activate, send me the payment reference or the checkout error.");
      }
      return reply(input.phone, "Thank you. I can only confirm a tailored-service payment against its secure MedMinds payment request. I don’t have that payment-request reference in this conversation yet, so I won’t mark it paid from a screenshot or message alone. Please resend the MedMinds payment link or reference if you already received one.");
    }

    try {
      const checked = await checkResearchPayment(token);
      if (!checked.checked) return reply(input.phone, "I can’t reach the MedMinds payment verification service right now. I have not marked the payment as confirmed; it remains pending until the portal verifies it.");
      const payment = checked.payment;
      if (payment.status !== "paid") {
        return reply(input.phone, `I checked the MedMinds/Sampay record and it is currently ${payment.status}. I can’t confirm receipt yet. I’ll only confirm the payment and receipt after the portal records it as paid.`);
      }

      const firstConfirmation = lead.status !== "CONVERTED";
      lead = await updateLead(input.phone, { status: "CONVERTED" }).catch(() => lead);
      if (firstConfirmation) {
        void sendSalesPipelineCopies({
          heading: "Sampay payment confirmed",
          body: [
            `Client: ${lead.name || payment.customerName}`,
            `Phone: ${lead.phone}`,
            `Email: ${lead.email || payment.customerEmail}`,
            `Service: ${payment.title}`,
            `Amount: ${money(payment.chargedAmount || payment.amount)}`,
            `Payment method: ${payment.paymentMethod || "Sampay"}`,
            `Reference: ${payment.reference || payment.transactionId || "Research Portal record"}`,
            "Status: PAID. Official receipt workflow triggered by the Research Portal.",
          ].join("\n"),
          lead,
        }).catch((error) => console.error("Confirmed Sampay payment team notification failed", { phoneSuffix: lead.phone.slice(-4), error }));
      }

      const receiptText = payment.receiptIssuedByEmail
        ? `Your official MedMinds receipt has been sent to ${payment.customerEmail}.`
        : "Your payment is confirmed and the receipt workflow has been triggered.";
      return reply(input.phone, `Payment confirmed ✅ I verified it against the MedMinds/Sampay record. ${receiptText} I’ve also forwarded the confirmed payment details to Dr. Mustafa and the relevant team so they can proceed.`);
    } catch (error) {
      console.error("Mary Sampay verification failed", { phoneSuffix: input.phone.slice(-4), error });
      return reply(input.phone, "I’m unable to complete the Sampay verification right now, so I have not marked the payment as confirmed. It remains pending until the MedMinds Research Portal verifies it.");
    }
  }

  if (course) {
    await updateLead(input.phone, { serviceInterest: "AI-Assisted Research Proposal Writing", status: CREATE_INTENT.test(latest) ? "PAYMENT PENDING" : lead.status }).catch(() => undefined);
    return reply(input.phone, `Yes. MedMinds uses Sampay for secure checkout, and the AI-Enhanced Research Writing course can be paid for using Mobile Money or a supported bank card. The current course fee is ${money(AI_RESEARCH_COURSE_PRICE_ZMW)}.\n\nCourse checkout: ${AI_RESEARCH_COURSE_URL}\n\nYou complete the payment directly on that checkout page; there is no need to send money to a personal number.`);
  }

  if (!CREATE_INTENT.test(latest)) {
    return reply(input.phone, "For MedMinds research-support services, we use secure Sampay payment links. The checkout supports Mobile Money and supported bank cards. Once the service and approved amount are confirmed, I can create the payment request and send it here on WhatsApp and to your email. I’ll need your full name, email address and Mobile Money number for the request.");
  }

  const email = lead.email || [...clientMessages, latest].reverse().map((v) => v.match(EMAIL)?.[0]).find(Boolean) || null;
  const statedPhone = [...clientMessages, latest].reverse().map((v) => v.match(PHONE)?.[0]).find(Boolean) || null;
  if (!lead.name?.trim()) return reply(input.phone, "I can create the secure Sampay payment request. What full name should I put on it?");
  if (!email) return reply(input.phone, "What email address should I use for the payment request and official receipt?");
  if (!statedPhone) return reply(input.phone, "Please send the Mobile Money number you want linked to the payment request. I’ll use it with your name and email to create the secure checkout link.");

  const quote = await getLatestPreparedQuotation(lead.id).catch(() => null);
  let service = quote?.service || lead.serviceInterest || lead.packageName || "Research support";
  let amount = quote?.amount_zmw == null ? null : Number(quote.amount_zmw);

  if (!(amount && Number.isFinite(amount) && amount > 0)) {
    const pricing = resolveCataloguePrice(await listOffers(true), { service, programme: lead.programme, deadline: lead.deadline });
    if (pricing.status !== "matched") {
      return reply(input.phone, "I have your payment details, but the final approved amount for this service is not yet available. I won’t create a payment request using a guessed fee. The quotation or approved amount needs to be confirmed first.");
    }
    service = pricing.offer.name;
    amount = Number(pricing.amountZmw);
  }

  try {
    const created = await createResearchPaymentRequest({
      lead,
      title: service,
      description: `Secure MedMinds Sampay payment request for ${service}. Payment may be completed using Mobile Money or supported cards.`,
      amountZmw: amount,
      customerName: lead.name,
      customerEmail: email,
      customerPhone: normalizePhone(statedPhone),
    });
    if (!created.created) return reply(input.phone, "I have the details, but the secure Research Portal payment-link service is not configured right now. I won’t provide an unofficial payment method. A MedMinds team member will need to issue the link.");

    await updateLead(input.phone, { email, serviceInterest: service, status: "PAYMENT PENDING" }).catch(() => undefined);
    const emailNote = created.emailSent ? `I’ve also sent the same request to ${email}.` : "The WhatsApp link is ready; if the email does not arrive, you can use this link directly.";
    return reply(input.phone, `Your secure Sampay payment request is ready for ${service}: ${money(amount)}. You can pay using Mobile Money or a supported bank card.\n\n${created.payment.link}\n\n${emailNote} After payment, tell me here and I’ll verify it against the MedMinds Research Portal before confirming your receipt.`);
  } catch (error) {
    console.error("Mary payment-link creation failed", { phoneSuffix: input.phone.slice(-4), error });
    return reply(input.phone, "I couldn’t create the secure payment link just now. I have not given you alternative personal payment details. I’ll keep the request pending until the MedMinds payment service is available.");
  }
}
