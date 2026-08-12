import { createCommercialPdf } from "@/lib/commercial-pdf";
import { sendWhatsAppPdfDocument } from "@/lib/whatsapp";
import type { Lead } from "@/lib/types";

export type CommercialRecord = {
  id: string;
  service: string;
  amount_zmw?: number | string | null;
  details: string;
  status: string;
  created_at?: string | null;
};

export function commercialDocumentNumber(record: CommercialRecord) {
  return `${record.status === "INVOICE_UNPAID" ? "INV" : "QUO"}-${String(record.id).slice(0, 8).toUpperCase()}`;
}

export function buildCommercialPdf(lead: Pick<Lead, "name" | "phone">, record: CommercialRecord) {
  const kind = record.status === "INVOICE_UNPAID" ? "invoice" : "quotation";
  return createCommercialPdf({
    kind,
    documentNumber: commercialDocumentNumber(record),
    clientName: lead.name || lead.phone,
    service: record.service,
    amountZmw: record.amount_zmw == null ? null : Number(record.amount_zmw),
    details: record.details,
    issuedAt: record.created_at || undefined
  });
}

export async function sendCommercialPdf(input: { lead: Lead; record: CommercialRecord; phoneNumberIdOverride?: string }) {
  const number = commercialDocumentNumber(input.record);
  const isInvoice = input.record.status === "INVOICE_UNPAID";
  const filename = `MedMinds-${isInvoice ? "Invoice" : "Quotation"}-${number}.pdf`;
  const pdf = buildCommercialPdf(input.lead, input.record);
  const result = await sendWhatsAppPdfDocument({
    phone: input.lead.phone,
    pdf,
    filename,
    caption: isInvoice
      ? `MedMinds unpaid invoice ${number}. Please review the attached document.`
      : `MedMinds quotation ${number}. Please review the attached document.`,
    phoneNumberIdOverride: input.phoneNumberIdOverride
  });
  return { ...result, documentNumber: number, filename, kind: isInvoice ? "invoice" as const : "quotation" as const };
}
