import { NextResponse } from "next/server";
import { getPayableQuote } from "@/lib/business-ops";
import { commercialPaymentAmount, quotationPaymentReference } from "@/lib/medminds-payment-policy";
import { createResearchPaymentRequest } from "@/lib/research-payments";
import type { CommercialRecord } from "@/lib/commercial-document";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId)) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
  try {
    const record = await getPayableQuote(quoteId) as CommercialRecord | null;
    if (!record) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    const amount = commercialPaymentAmount(record);
    if (!amount) return NextResponse.json({ error: "This quotation has no payable amount." }, { status: 409 });
    const created = await createResearchPaymentRequest({
      title: record.service,
      description: `MedMinds ${record.status === "INVOICE_UNPAID" ? "invoice balance" : "quotation payment"}. Reference: ${quoteId}`,
      amountZmw: amount,
      sourceReference: quotationPaymentReference(record, amount),
    });
    if (!created.created) return NextResponse.json({ error: "Payment checkout is temporarily unavailable. Please use the MedMinds bank details on your quotation." }, { status: 503 });
    return NextResponse.redirect(created.payment.link, { status: 303, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to open checkout. Please use the MedMinds bank details on your quotation." }, { status: 503 });
  }
}
