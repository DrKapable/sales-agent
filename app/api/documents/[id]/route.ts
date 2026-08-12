import { NextRequest, NextResponse } from "next/server";
import { getBusinessSnapshot } from "@/lib/business-ops";
import { buildCommercialPdf, commercialDocumentNumber } from "@/lib/commercial-document";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const snapshot = await getBusinessSnapshot();
  const record = snapshot.quotes.find((item: any) => item.id === id && ["QUOTATION", "INVOICE_UNPAID"].includes(item.status));
  if (!record) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const lead = snapshot.leads.find((item: any) => item.id === record.lead_id);
  if (!lead) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  const pdf = buildCommercialPdf(lead, record);
  const number = commercialDocumentNumber(record);
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
