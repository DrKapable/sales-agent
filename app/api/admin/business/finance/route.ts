import { NextResponse } from "next/server";
import { z } from "zod";
import { recordFinancialPayment, verifyFinancialPayment } from "@/lib/payment-finance";
import { listLeads } from "@/lib/store";
import { notifyBusinessEvent } from "@/lib/business-notifications";
import { sendBrandedReceiptPdf } from "@/lib/receipt-delivery";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("payment"),
    leadId: z.string().min(1),
    totalChargedZmw: z.number().positive(),
    amountPaidZmw: z.number().positive(),
    reference: z.string().max(160).optional(),
    verified: z.boolean().optional(),
    verifiedBy: z.string().max(160).optional()
  }),
  z.object({
    action: z.literal("verify_payment"),
    paymentId: z.string().uuid(),
    verifiedBy: z.string().max(160).optional()
  })
]);

function money(value: number) {
  return `K${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function sendReceiptSafely(lead: Awaited<ReturnType<typeof listLeads>>[number], payment: any) {
  try {
    const receipt = await sendBrandedReceiptPdf({ lead, payment });
    return { receiptSent: true as const, receipt };
  } catch (error) {
    const receiptError = error instanceof Error ? error.message : "Receipt could not be sent.";
    console.error("Financial payment receipt delivery failed", { paymentId: payment?.id, error });
    return { receiptSent: false as const, receiptError };
  }
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid payment details." }, { status: 400 });

  try {
    const leads = await listLeads();

    if (parsed.data.action === "payment") {
      const lead = leads.find((item) => item.id === parsed.data.leadId) || null;
      if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });

      const result = await recordFinancialPayment({
        leadId: parsed.data.leadId,
        totalChargedZmw: parsed.data.totalChargedZmw,
        amountPaidZmw: parsed.data.amountPaidZmw,
        reference: parsed.data.reference,
        verified: Boolean(parsed.data.verified),
        verifiedBy: parsed.data.verifiedBy,
        service: lead.serviceInterest || lead.packageName
      });

      const payment = result.payment as any;
      const verified = Boolean(parsed.data.verified);
      const type = verified ? "payment_verified" : "payment_pending";
      void notifyBusinessEvent({
        type,
        eventKey: `${type}:${String(payment.id)}`,
        title: verified ? "Payment verified" : "Payment recorded, verification pending",
        body: [
          `Total charged: ${money(result.totalChargedZmw)}`,
          `This payment: ${money(result.amountPaidZmw)}`,
          verified ? `Cumulative paid: ${money(result.cumulativePaidZmw)}` : `Verified paid so far: ${money(result.cumulativePaidZmw)}`,
          `${verified ? "Balance" : "Projected balance after verification"}: ${money(result.balanceZmw)}`,
          parsed.data.reference ? `Reference: ${parsed.data.reference}` : null
        ].filter(Boolean).join("\n"),
        lead
      }).catch(() => undefined);

      const receiptResult = verified ? await sendReceiptSafely(lead, payment) : {};
      return NextResponse.json({
        ...payment,
        total_charged_zmw: result.totalChargedZmw,
        amount_paid_zmw: result.amountPaidZmw,
        cumulative_paid_zmw: result.cumulativePaidZmw,
        balance_zmw: result.balanceZmw,
        official_balance_zmw: result.officialBalanceZmw,
        invoice: result.invoice,
        ...receiptResult
      });
    }

    const result = await verifyFinancialPayment(parsed.data);
    const payment = result.payment as any;
    const lead = leads.find((item) => item.id === String(payment.lead_id)) || null;
    if (!lead) return NextResponse.json({ error: "The client linked to this payment could not be found." }, { status: 404 });

    void notifyBusinessEvent({
      type: "payment_verified",
      eventKey: `payment_verified:${String(payment.id)}`,
      title: "Payment verified",
      body: [
        `Total charged: ${money(result.totalChargedZmw)}`,
        `This payment: ${money(result.amountPaidZmw)}`,
        `Cumulative paid: ${money(result.cumulativePaidZmw)}`,
        `Balance: ${money(result.balanceZmw)}`,
        payment.reference ? `Reference: ${payment.reference}` : null
      ].filter(Boolean).join("\n"),
      lead
    }).catch(() => undefined);

    const receiptResult = await sendReceiptSafely(lead, payment);
    return NextResponse.json({
      ...payment,
      total_charged_zmw: result.totalChargedZmw,
      amount_paid_zmw: result.amountPaidZmw,
      cumulative_paid_zmw: result.cumulativePaidZmw,
      balance_zmw: result.balanceZmw,
      invoice: result.invoice,
      ...receiptResult
    });
  } catch (error) {
    console.error("Financial payment action failed", { action: parsed.data.action, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update payment." }, { status: 400 });
  }
}
