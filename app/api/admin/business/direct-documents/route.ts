import { NextResponse } from "next/server";
import { z } from "zod";
import { clientWhatsAppNumberSchema, directDocumentActionSchema } from "@/lib/direct-document-input";
import { directClientDocumentDelivery, listDirectClientDocuments, previewDirectClientDocument, sendDirectClientDocument } from "@/lib/direct-client-documents";
import { clientDocumentTemplateResults } from "@/lib/client-document-templates";
import { createQuote } from "@/lib/business-ops";
import { paymentBreakdown, recordFinancialPayment } from "@/lib/payment-finance";
import { getOrCreateLead, updateLead } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const phone = params.get("phone");
  try {
    if (!phone) return NextResponse.json({ templates: await clientDocumentTemplateResults() });
    const parsed = clientWhatsAppNumberSchema.safeParse(phone);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    if (params.has("documentId")) {
      const preview = z.object({ documentId: z.string().uuid(), kind: z.enum(["quotation", "receipt"]) }).safeParse({ documentId: params.get("documentId"), kind: params.get("kind") });
      if (!preview.success) return NextResponse.json({ error: "Select a valid document." }, { status: 400 });
      if (params.get("delivery") === "true") return NextResponse.json(await directClientDocumentDelivery({ phone: parsed.data, ...preview.data, messageId: params.get("messageId") || undefined }));
      const { pdf, filename } = await previewDirectClientDocument({ phone: parsed.data, ...preview.data });
      return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json(await listDirectClientDocuments(parsed.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load client documents." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const parsed = directDocumentActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;
  try {
    if (input.action === "send") {
      const delivery = await sendDirectClientDocument(input);
      return NextResponse.json({ delivery: { ...delivery, status: "ACCEPTED", mode: "template" }, phone: input.phone });
    }
    if (input.action === "create_receipt") paymentBreakdown(input.totalChargedZmw, input.amountPaidZmw);
    let lead = await getOrCreateLead(input.phone, "whatsapp");
    lead = await updateLead(input.phone, { name: input.name, serviceInterest: input.service });
    if (input.action === "create_quotation") {
      const document = await createQuote({ leadId: lead.id, service: input.service, amountZmw: input.amountZmw, details: input.details, status: "QUOTATION" });
      return NextResponse.json({ kind: "quotation", document, phone: lead.phone }, { status: 201 });
    }
    const finance = await recordFinancialPayment({ leadId: lead.id, totalChargedZmw: input.totalChargedZmw, amountPaidZmw: input.amountPaidZmw,
      reference: input.reference, verified: Boolean(input.verified), verifiedBy: input.verifiedBy, recordedBy: input.recordedBy, service: input.service });
    return NextResponse.json({ kind: "receipt", document: finance.payment, phone: lead.phone }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save or send the document." }, { status: input.action === "send" ? 409 : 400 });
  }
}
