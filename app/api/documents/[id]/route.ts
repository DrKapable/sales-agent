import { getLeadById } from "@/lib/store";
import { NextRequest, NextResponse } from "next/server";
import { getPayableQuote } from "@/lib/business-ops";
import { buildCommercialPdf, commercialDocumentNumber, type CommercialRecord } from "@/lib/commercial-document";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const record = await getPayableQuote(id);
  if (!record) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const lead = await getLeadById(String(record.lead_id));
  if (!lead) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const pdf = buildCommercialPdf(lead, record as CommercialRecord);
  const number = commercialDocumentNumber(record as CommercialRecord);
  const filename = `MedMinds-${record.status === "INVOICE_UNPAID" ? "Invoice" : "Quotation"}-${number}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
