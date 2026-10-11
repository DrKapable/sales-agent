import { addMessage } from "@/lib/store";
import type { Lead } from "@/lib/types";
import { createBrandedReceiptPdf } from "@/lib/receipt-pdf";
import { sendClientDocument } from "@/lib/client-document-delivery";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";

type VerifiedPayment = {
  id: string;
  amount_zmw: number | string;
  total_charged_zmw?: number | string | null;
  amount_paid_zmw?: number | string | null;
  balance_zmw?: number | string | null;
  reference?: string | null;
  status?: string;
  verified_at?: string | null;
  verified_by?: string | null;
};

export function receiptNumber(paymentId: string) {
  return `MM-${String(paymentId).slice(0, 8).toUpperCase()}`;
}

export async function sendBrandedReceiptPdf(input: { lead: Lead; payment: VerifiedPayment }) {
  if (input.payment.status !== "VERIFIED") throw new Error("Only verified payments can be issued as receipts.");

  const number = receiptNumber(input.payment.id);
  const paid = Number(input.payment.amount_paid_zmw ?? input.payment.amount_zmw);
  const total = Number(input.payment.total_charged_zmw ?? paid);
  const balance = Number(input.payment.balance_zmw ?? Math.max(total - paid, 0));
  const pdf = createBrandedReceiptPdf({
    receiptNumber: number,
    clientName: input.lead.name || input.lead.phone,
    amountZmw: paid,
    totalChargedZmw: total,
    balanceZmw: balance,
    paymentReference: input.payment.reference,
    verifiedAt: input.payment.verified_at,
    service: input.lead.serviceInterest || input.lead.packageName,
    verifiedBy: input.payment.verified_by || "MedMinds Administration"
  });
  const filename = `MedMinds_Receipt_${number}.pdf`;
  const firstName = input.lead.name?.trim().split(/\s+/)[0];
  const caption = `${firstName ? `Hi ${firstName}, ` : ""}payment received. Please find your official MedMinds receipt attached${balance > 0 ? `; remaining balance K${balance.toLocaleString()}` : ""}.`;
  const result = await sendClientDocument({ kind: "receipt", phone: input.lead.phone, clientName: input.lead.name,
    documentNumber: number, detail: paid.toFixed(2), pdf, filename, caption });
  await addMessage(input.lead.phone, "assistant", `[Branded PDF receipt submitted: ${filename}]`, result.messageId);
  await recordOutgoingMessageAccepted({ phone: input.lead.phone, messageId: result.messageId }).catch(() => undefined);
  return { sent: true, receipt: number, filename, messageId: result.messageId, totalChargedZmw: total, amountPaidZmw: paid, balanceZmw: balance };
}
