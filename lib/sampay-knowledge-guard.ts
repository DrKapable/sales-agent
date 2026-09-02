import { AI_RESEARCH_COURSE_PRICE_ZMW, AI_RESEARCH_COURSE_URL } from "@/lib/research-payments";

const LEGACY_PAYMENT = /0977259132|0969152364|airtel\s*money|mtn\s*money|registered to juma phiri|registered to musonda mupeta|send proof of payment/i;
const COURSE = /ai[- ]enhanced research writing|ai[- ]assisted research proposal writing|research writing course|proposal writing course|research course|self[- ]paced|self[- ]directed/i;

export function sanitizeMaryPaymentKnowledge(reply: string, context: string) {
  if (!LEGACY_PAYMENT.test(reply)) return reply;

  const kept = reply
    .split(/\n+/)
    .filter((line) => !LEGACY_PAYMENT.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const paymentGuidance = COURSE.test(`${context}\n${reply}`)
    ? `For payment, use the secure MedMinds course checkout. The current AI-Enhanced Research Writing course fee is K${AI_RESEARCH_COURSE_PRICE_ZMW}, and Sampay supports Mobile Money and supported bank cards:\n${AI_RESEARCH_COURSE_URL}`
    : "For payment, MedMinds uses secure Sampay payment links. The checkout supports Mobile Money and supported bank cards. Once the approved service amount is confirmed, I can create the payment request and send it here on WhatsApp and to your email.";

  return [kept, paymentGuidance, "I will only confirm payment after the MedMinds/Sampay record shows it as paid; a screenshot alone is not payment confirmation."].filter(Boolean).join("\n\n");
}
