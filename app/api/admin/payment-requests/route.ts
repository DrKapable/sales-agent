import { NextResponse } from "next/server";
import { z } from "zod";
import { getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";
import { resolveCataloguePrice } from "@/lib/catalogue-pricing";
import { getLatestPreparedQuotation } from "@/lib/prepared-quotation";
import {
  AI_RESEARCH_COURSE_PRICE_ZMW,
  AI_RESEARCH_COURSE_URL,
  checkResearchPayment,
  createResearchPaymentRequest,
  latestPaymentTokenForLead,
} from "@/lib/research-payments";

const postSchema = z.object({
  phone: z.string().min(8).max(40),
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().trim().email().max(180),
  customerPhone: z.string().trim().min(8).max(40),
  service: z.string().trim().min(2).max(240).optional(),
});

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") && digits.length === 10 ? `260${digits.slice(1)}` : digits;
}

function isCourse(value: string) {
  return /ai[- ](?:enhanced research writing|assisted research proposal writing)|research writing course/i.test(value);
}

export async function GET(request: Request) {
  const phone = normalizePhone(new URL(request.url).searchParams.get("phone") || "");
  if (!/^\d{8,15}$/.test(phone)) return NextResponse.json({ error: "Valid client phone is required." }, { status: 400 });
  const lead = await getOrCreateLead(phone, "simulator");
  const token = await latestPaymentTokenForLead(lead);
  if (!token) return NextResponse.json({ ok: true, payment: null });
  try {
    const checked = await checkResearchPayment(token);
    return NextResponse.json({ ok: true, payment: checked.checked ? checked.payment : null });
  } catch (error) {
    console.error("Admin payment status lookup failed", { phoneSuffix: phone.slice(-4), error });
    return NextResponse.json({ error: "Unable to check payment status." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Name, valid email and Mobile Money number are required." }, { status: 400 });

  const phone = normalizePhone(parsed.data.phone);
  const lead = await getOrCreateLead(phone, "simulator");
  const requestedService = parsed.data.service || lead.serviceInterest || lead.packageName || "Research support";

  if (isCourse(requestedService)) {
    return NextResponse.json({
      ok: true,
      directCheckout: true,
      service: "AI-Enhanced Research Writing",
      amountZmw: AI_RESEARCH_COURSE_PRICE_ZMW,
      link: AI_RESEARCH_COURSE_URL,
      methods: ["Mobile Money", "Supported bank cards"],
    });
  }

  const quote = await getLatestPreparedQuotation(lead.id).catch(() => null);
  let service = quote?.service || requestedService;
  let amount = quote?.amount_zmw == null ? null : Number(quote.amount_zmw);
  if (!(amount && Number.isFinite(amount) && amount > 0)) {
    const pricing = resolveCataloguePrice(await listOffers(true), { service, programme: lead.programme, deadline: lead.deadline });
    if (pricing.status !== "matched") {
      return NextResponse.json({ error: "An approved quotation or catalogue amount is required before creating a payment request." }, { status: 409 });
    }
    service = pricing.offer.name;
    amount = Number(pricing.amountZmw);
  }

  try {
    const created = await createResearchPaymentRequest({
      lead,
      title: service,
      description: `Secure MedMinds Sampay payment request for ${service}.`,
      amountZmw: amount,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: normalizePhone(parsed.data.customerPhone),
    });
    if (!created.created) return NextResponse.json({ error: created.reason }, { status: 503 });
    await updateLead(phone, { email: parsed.data.customerEmail, serviceInterest: service, status: "PAYMENT PENDING" }).catch(() => undefined);
    return NextResponse.json({ ok: true, directCheckout: false, payment: created.payment, emailSent: created.emailSent });
  } catch (error) {
    console.error("Admin Sampay payment request failed", { phoneSuffix: phone.slice(-4), error });
    return NextResponse.json({ error: "Unable to create the secure payment request." }, { status: 502 });
  }
}