import { NextResponse } from "next/server";
import { z } from "zod";
import { recordFinancialPayment } from "@/lib/payment-finance";
import { listLeads } from "@/lib/store";
import { notifyBusinessEvent } from "@/lib/business-notifications";
import { sendBrandedReceiptPdf } from "@/lib/receipt-delivery";

const schema = z.object({
  action: z.literal("payment"),
  leadId: z.string().min(1),
  totalChargedZmw: z.number().positive(),
  amountPaidZmw: z.number().positive(),
  reference: z.string().max(160).optional(),
  verified: z.boolean().optional(),
  verifiedBy: z.string().max(160).optional()
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid total charged and amount paid." }, { status: 400 });

  try {
    const lead = (await listLeads()).find((item) => item.id === parsed.data.leadId) || null;
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
    const type = parsed.data.verified ? "payment_verified" : "payment_pending";
    void notifyBusinessEvent({
      type,
      eventKey: `${type}:${String(payment.id)}`,
      title: parsed.data.verified ? "Payment verified" : "Payment recorded, verification pending",
      body: [
        `Total charged: K${result.totalChargedZmw.toLocaleString()}`,
        `Amount paid: K${result.amountPaidZmw.toLocaleString()}`,
        `Balance: K${result.balanceZmw.toLocaleString()}`,
        parsed.data.reference ? `Reference: ${parsed.data.reference}` : null
      ].filter(Boolean).join("\n"),
      lead
    }).catch(() => undefined);

    let receipt: any = null;
    let receiptError: string | null = null;
    if (parsed.data.verified) {
      try {
        receipt = await sendBrandedReceiptPdf({ lead, payment });
      } catch (error) {
        receiptError = error instanceof Error ? error.message : "Receipt could not be sent.";
        console.error("Financial payment receipt delivery failed", { paymentId: payment.id, error });
      }
    }

    return NextResponse.json({
      ...payment,
      total_charged_zmw: result.totalChargedZmw,
      amount_paid_zmw: result.amountPaidZmw,
      balance_zmw: result.balanceZmw,
      invoice: result.invoice,
      ...(receipt ? { receiptSent: true, receipt } : parsed.data.verified ? { receiptSent: false, receiptError } : {})
    });
  } catch (error) {
    console.error("Financial payment action failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record payment." }, { status: 400 });
  }
}
