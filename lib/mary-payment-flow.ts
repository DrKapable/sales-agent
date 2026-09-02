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

const PAY_INTENT = /\b(pay|payment|payment link|checkout|ready to pay|want to pay|make payment|proceed with payment|send (?:me )?(?:the )?link)\b/i;
const PAID_INTENT = /\b(i(?:'|’)ve paid|i have paid|paid already|payment (?:is )?(?:done|made|completed|successful)|completed (?:the )?payment|just paid)\b/i;
const COURSE_CONTEXT = /\b(ai[- ]enhanced research writing|ai[- ]assisted research proposal writing|research writing course|proposal writing course|research course|self[- ]directed|self[- ]paced)\b/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+?260|0)\d{9}\b/;

function result(reply: string): SalesAgentResult {
  return { reply, referralNotification: null, documentIds: [] };
}

function money(value: number) {
  return `K${Number(value).toLocaleString("en-ZM", { maximumFractionDigits: 2 })}`;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `260${digits.slice(1)}`;
  return digits;
}

async function saveReply(phone: string, reply: string) {
  await addMessage(phone, "assistant", reply);
  return result(reply);
}

export async function handleMaryPaymentFlow(input: {
  phone: string;
  text: string;
  source: "whatsapp" | "simulator";
}): Promise<SalesAgentResult | null> {
  const latest = input.text.trim();
  if (!PAY_INTENT.test(latest) && !PAID_INTENT.test(latest)) return null;

  let lead = await getOrCreateLead(input.phone, input.source);
  const history = await getConversation(input.phone, 80).catch(() => []);
  const clientText = [...history.filter((m) => m.role === "user").map((m) => m.content), latest].join("\n");
  const context = `${lead.serviceInterest || ""} ${lead.packageName || ""} ${clientText}`;

  if (COURSE_CONTEXT.test(context) && !PAID_INTENT.test(latest)) {
    const reply = `The AI-Enhanced Research Writing course is currently ${money(AI_RESEARCH_COURSE_PRICE_ZMW)}. You can pay securely on the course checkout using Mobile Money or a bank card through Sampay:\n\n${AI_RESEARCH_COURSE_URL}\n\nOnce payment is completed, the course checkout will process your access. If you run into any payment problem, send me the error and I’ll help.`;
    await updateLead(input.phone, { serviceInterest: "AI-Assisted Research Proposal Writing", status: "PAYMENT PENDING" }).catch(() => undefined);
    return saveReply(input.phone, reply);
  }

  if (PAID_INTENT.test(latest)) {
    const token = await latestPaymentTokenForLead(lead);
    if (!token) {
      if (COURSE_CONTEXT.test(context)) {
        return saveReply(input.phone, `Thank you. If you paid through the course checkout, please allow the checkout to finish processing. I can only confirm payment after Sampay/MedMinds records it as successful. If your access does not activate, send me the payment reference or the error shown at checkout.`);
      }
      return saveReply(input.phone, "Thank you. I can verify a tailored-service payment only against the secure MedMinds payment request. I don’t have a payment-request reference in this conversation yet, so I won’t mark it as paid based on a screenshot or message alone. Please resend the MedMinds payment link or payment reference if you already received one.");
    }

    try {
      const checked = await checkResearchPayment(token);
      if (!checked.checked) return saveReply(input.phone, "I can’t reach the MedMinds payment verification service at the moment. I have not marked the payment as confirmed. I’ll keep it pending until the portal can verify it.");
      const payment = checked.payment;
      if (payment.status !== "paid") {
        return saveReply(input.phone, `I’ve checked the MedMinds payment record. It is currently showing ${payment.status}, so I can’t confirm receipt yet. Please allow Sampay a little time to complete processing. I’ll only issue/confirm the receipt after the portal records the payment as paid.`);
      }

      const wasConverted = lead.status === "CONVERTED";
      lead = await updateLead(input.phone, { status: "CONVERTED" }).catch(() => lead);
      if (!wasConverted) {
        void sendSalesPipelineCopies({
          heading: "Sampay payment confirmed",
          body: [
            `Client: ${lead.name || payment.customerName}`,
            `Phone: ${lead.phone}`,
            `Email: ${lead.email || payment.customerEmail}`,
            `Service: ${payment.title}`,
            `Amount: ${money(payment.chargedAmount || payment.amount)}`,
            `Payment method: ${payment.paymentMethod || "Sampay"}`,
            `Reference: ${payment.reference || payment.transactionId || "Recorded in Research Portal"}`,
            "Status: PAID. Official receipt workflow triggered by the Research Portal.",
          ].join("\n"),
          lead,
        }).catch((error) => console.error("Confirmed Sampay payment team notification failed", { phoneSuffix: lead.phone.slice(-4), error }));
      }

      const receipt = payment.receiptIssuedByEmail
        ? `Your official MedMinds receipt has been sent to ${payment.customerEmail}.`
        : "Your payment is confirmed. The MedMinds team will complete the receipt workflow.";
      return saveReply(input.phone, `Payment confirmed ✅ I’ve verified it against the MedMinds/Sampay record. ${receipt} I’ve also forwarded the confirmed payment details to Dr. Mustafa and the relevant team so they can proceed with your service.`);
    } catch (error) {
      console.error("Mary Sampay verification failed", { phoneSuffix: input.phone.slice(-4), error });
      return saveReply(input.phone, "I’m unable to complete the Sampay verification right now, so I have not marked the payment as confirmed. Your payment remains pending until the MedMinds Research Portal verifies it.");
    }
  }

  const userMessages = history.filter((m) => m.role === "user").map((m) => m.content);
  const email = lead.email || [...userMessages, latest].reverse().map((v) => v.match(EMAIL)?.[0]).find(Boolean) || null;
  const statedPhone = [...userMessages, latest].reverse().map((v) => v.match(PHONE)?.[0]).find(Boolean) || null;

  if (!lead.name?.trim()) return saveReply(input.phone, "I can create a secure Sampay payment link for you. First, what full name should I put on the payment request?");
  if (!email) return saveReply(input.phone, "Great. What email address should I use for the payment request and official receipt?");
  if (!statedPhone) return saveReply(input.phone, "Please send the Mobile Money number you want linked to the payment request. I’ll use it together with your name and email to create the secure checkout link.");

  const quote = await getLatestPreparedQuotation(lead.id).catch(() => null);
  let service = quote?.service || lead.serviceInterest || lead.packageName || "Research support";
  let amount = quote?.amount_zmw == null ? null : Number(quote.amount_zmw);

  if (!(amount && Number.isFinite(amount) && amount > 0)) {
    const pricing = resolveCataloguePrice(await listOffers(true), {
      service,
      programme: lead.programme,
      deadline: lead.deadline,
    });
    if (pricing.status !== "priced") {
      return saveReply(input.phone, "I have your payment details, but the final approved amount for this service still needs to be confirmed. I won’t create a payment request with a guessed amount. I’ll keep this at the quotation stage until the approved fee is available.");
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
    if (!created.created) return saveReply(input.phone, "I have the details, but the secure Research Portal payment-link service is not configured right now. I won’t provide an unofficial payment method. A MedMinds team member will need to issue the link.");

    await updateLead(input.phone, { email, serviceInterest: service, status: "PAYMENT PENDING" }).catch(() => undefined);
    const emailNote = created.emailSent ? `I’ve also sent the same request to ${email}.` : `The WhatsApp link is ready; if the email does not arrive, you can use the link below.`;
    return saveReply(input.phone, `Your secure Sampay payment request is ready for ${service}: ${money(amount)}. You can pay using Mobile Money or a supported bank card.\n\n${created.payment.link}\n\n${emailNote} Once you complete payment, tell me here and I’ll verify it against the MedMinds Research Portal before confirming your receipt.`);
  } catch (error) {
    console.error("Mary payment-link creation failed", { phoneSuffix: input.phone.slice(-4), error });
    return saveReply(input.phone, "I couldn’t create the secure payment link just now. I have not given you alternative personal payment details. I’ll keep the request pending until the MedMinds payment service is available.");
  }
}
