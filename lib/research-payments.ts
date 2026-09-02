import type { Lead } from "@/lib/types";
import { getConversation } from "@/lib/store";

export const AI_RESEARCH_COURSE_URL = "https://www.medmindslc.online/courses/ai-enhanced-research-writing";
export const AI_RESEARCH_COURSE_PRICE_ZMW = 350;

export type ResearchPayment = {
  token: string;
  link: string;
  title: string;
  description: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  status: "unpaid" | "pending" | "paid" | "failed" | "cancelled" | "expired";
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  reference: string | null;
  transactionId: string | null;
  providerStatus: string | null;
  paymentMethod: string | null;
  chargedAmount: number;
  providerCurrency: string;
  receiptIssuedByEmail: boolean;
};

function config() {
  const secret = process.env.RESEARCH_ASSISTANT_SECRET;
  const url = process.env.RESEARCH_PORTAL_PAYMENT_URL || "https://www.medmindslc.online/api/research/assistant-admin/payment-requests";
  return { secret, url };
}

export async function createResearchPaymentRequest(input: {
  lead: Lead;
  title: string;
  description?: string;
  amountZmw: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  expiryDays?: number;
}) {
  const { secret, url } = config();
  if (!secret) return { created: false as const, configured: false as const, reason: "Research Portal payment automation is not configured." };
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      description: input.description || `MedMinds payment for ${input.title}`,
      amount: input.amountZmw,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      expiryDays: input.expiryDays || 30,
      sourceReference: `sales-lead:${input.lead.id}`,
    }),
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; payment?: ResearchPayment; emailSent?: boolean; error?: string };
  if (!response.ok || !data.ok || !data.payment?.token) throw new Error(data.error || `Research Portal payment service returned ${response.status}.`);
  return { created: true as const, configured: true as const, payment: data.payment, emailSent: Boolean(data.emailSent) };
}

export async function checkResearchPayment(token: string) {
  const { secret, url } = config();
  if (!secret) return { checked: false as const, configured: false as const, reason: "Research Portal payment automation is not configured." };
  const response = await fetch(`${url}?token=${encodeURIComponent(token)}`, {
    method: "GET",
    signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; payment?: ResearchPayment; error?: string };
  if (!response.ok || !data.ok || !data.payment) throw new Error(data.error || `Research Portal payment lookup returned ${response.status}.`);
  return { checked: true as const, configured: true as const, payment: data.payment };
}

export async function latestPaymentTokenForLead(lead: Lead) {
  const messages = await getConversation(lead.phone, 80).catch(() => []);
  for (const message of [...messages].reverse()) {
    const match = message.content.match(/https?:\/\/[^\s]+\/pay\/([a-f0-9]{36})\b/i);
    if (match?.[1]) return match[1];
  }
  return null;
}
