import { createCommercialPdf } from "@/lib/commercial-pdf";
import { markQuoteAccepted } from "@/lib/quotation-delivery";
import { sendWhatsAppPdfDocument } from "@/lib/whatsapp";
import type { Lead } from "@/lib/types";

export type CommercialRecord = {
  id: string;
  service: string;
  amount_zmw?: number | string | null;
  total_charged_zmw?: number | string | null;
  amount_paid_zmw?: number | string | null;
  balance_zmw?: number | string | null;
  details: string;
  status: string;
  created_at?: string | null;
};

export function isInvoiceStatus(status: string | null | undefined) {
  return String(status || "").toUpperCase().startsWith("INVOICE_");
}

export function commercialDocumentNumber(record: CommercialRecord) {
  return `${isInvoiceStatus(record.status) ? "INV" : "QUO"}-${String(record.id).slice(0, 8).toUpperCase()}`;
}

export function buildCommercialPdf(lead: Pick<Lead, "name" | "phone">, record: CommercialRecord) {
  const kind = isInvoiceStatus(record.status) ? "invoice" : "quotation";
  return createCommercialPdf({
    kind,
    documentNumber: commercialDocumentNumber(record),
    clientName: lead.name || lead.phone,
    service: record.service,
    amountZmw: record.amount_zmw == null ? null : Number(record.amount_zmw),
    totalChargedZmw: record.total_charged_zmw == null ? undefined : Number(record.total_charged_zmw),
    amountPaidZmw: record.amount_paid_zmw == null ? undefined : Number(record.amount_paid_zmw),
    balanceZmw: record.balance_zmw == null ? undefined : Number(record.balance_zmw),
    details: record.details,
    issuedAt: record.created_at || undefined
  });
}

export async function sendCommercialPdf(input: { lead: Lead; record: CommercialRecord; phoneNumberIdOverride?: string }) {
  const number = commercialDocumentNumber(input.record);
  const isInvoice = isInvoiceStatus(input.record.status);
  const filename = `MedMinds-${isInvoice ? "Invoice" : "Quotation"}-${number}.pdf`;
  const pdf = buildCommercialPdf(input.lead, input.record);
  const result = await sendWhatsAppPdfDocument({
    phone: input.lead.phone,
    pdf,
    filename,
    caption: isInvoice
      ? `MedMinds invoice ${number}. Please review the attached payment and balance details.`
      : `MedMinds quotation ${number}. Please review the attached document.`,
    phoneNumberIdOverride: input.phoneNumberIdOverride
  });
  await markQuoteAccepted(input.record.id, result.messageId).catch((error) => {
    console.warn("Unable to link commercial document delivery", { quoteId: input.record.id, error });
  });
  return { ...result, documentNumber: number, filename, kind: isInvoice ? "invoice" as const : "quotation" as const };
}
