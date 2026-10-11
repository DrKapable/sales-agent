import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { isAuthorizedTemplateSetup } from "@/lib/template-setup-auth";
import { clientDocumentTemplateResults } from "@/lib/client-document-templates";
import { createResearchPaymentRequest } from "@/lib/research-payments";
import { commercialPaymentAmount, quotationPaymentReference } from "@/lib/medminds-payment-policy";
import type { CommercialRecord } from "@/lib/commercial-document";

export const maxDuration = 180;
export const dynamic = "force-dynamic";
const failedMessage = "wamid.HBgMMjYwOTc3MjU5MTMyFQIAERgSMUZDQTBGQkYyMzdFOTczRkFBAA==";
async function failedQuotation() {
  if (!process.env.DATABASE_URL) return null;
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql.query(`SELECT q.*, l.phone, l.name FROM sales_quotes q JOIN leads l ON l.id=q.lead_id WHERE q.delivery_message_id=$1 LIMIT 1`, [failedMessage]);
  return rows[0] || null;
}
export async function GET(request: Request) {
  if (!isAuthorizedTemplateSetup(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const templates = await clientDocumentTemplateResults();
  const quote = await failedQuotation();
  return NextResponse.json({ templates, quotation: quote && { id: quote.id, phone: quote.phone, service: quote.service, amount: quote.amount_zmw, deliveryStatus: quote.delivery_status, deliveryError: quote.delivery_error } });
}
export async function POST(request: Request) {
  if (!isAuthorizedTemplateSetup(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (new URL(request.url).searchParams.get("action") === "checkout-diagnostic") {
    const row = await failedQuotation();
    if (!row) return NextResponse.json({ error: "Failed quotation not found" }, { status: 404 });
    const quote = row as unknown as CommercialRecord;
    const amount = commercialPaymentAmount(quote);
    try {
      const payment = await createResearchPaymentRequest({ title: quote.service, description: `MedMinds quotation payment. Reference: ${quote.id}`, amountZmw: amount!, sourceReference: quotationPaymentReference(quote, amount!) });
      return NextResponse.json(payment);
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Checkout failed" }, { status: 502 }); }
  }
  const templates = await clientDocumentTemplateResults(true);
  return NextResponse.json({ templates }, { status: templates.some((item) => "error" in item) ? 502 : 200 });
}
