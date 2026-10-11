import { addMessage } from "@/lib/store";
import type { Lead } from "@/lib/types";
import { createBrandedReceiptPdf } from "@/lib/receipt-pdf";
import { sendClientDocument } from "@/lib/client-document-delivery";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";

export type VerifiedPayment = {
  id: string;
  amount_zmw: number | string;
  total_charged_zmw?: number | string | null;
  amount_paid_zmw?: number | string | null;
  balance_zmw?: number | string | null;
  reference?: string | null;
  status?: string;
  created_at?: string | null;
  recorded_by?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
};

export function receiptNumber(paymentId: string) {
  return `MM-${String(paymentId).slice(0, 8).toUpperCase()}`;
}

export function buildReceiptPdf(input: { lead: Lead; payment: VerifiedPayment }) {
  if (!["PENDING", "RECORDED", "VERIFIED"].includes(input.payment.status || "")) throw new Error("Receipts require a recorded payment that has not failed, been cancelled or refunded.");

  const number = receiptNumber(input.payment.id);
  const paid = Number(input.payment.amount_paid_zmw ?? input.payment.amount_zmw);
  const total = Number(input.payment.total_charged_zmw ?? paid);
  const balance = Number(input.payment.balance_zmw ?? Math.max(total - paid, 0));
  if (![paid, total, balance].every(Number.isFinite) || paid <= 0 || total < paid || balance < 0 || Math.abs(total - paid - balance) > 0.01) throw new Error("The recorded payment amounts are invalid.");
  const pdf = createBrandedReceiptPdf({
    receiptNumber: number,
    clientName: input.lead.name || input.lead.phone,
    amountZmw: paid,
    totalChargedZmw: total,
    balanceZmw: balance,
    paymentReference: input.payment.reference,
    recordedAt: input.payment.created_at || input.payment.verified_at,
    service: input.lead.serviceInterest || input.lead.packageName,
    recordedBy: input.payment.recorded_by || input.payment.verified_by || "MedMinds Administration"
  });
  const filename = `MedMinds_Receipt_${number}.pdf`;
  return { number, paid, total, balance, pdf, filename };
}

export async function sendBrandedReceiptPdf(input: { lead: Lead; payment: VerifiedPayment; forceTemplate?: boolean; phoneNumberIdOverride?: string }) {
  const { number, paid, total, balance, pdf, filename } = buildReceiptPdf(input);
  const firstName = input.lead.name?.trim().split(/\s+/)[0];
  const caption = `${firstName ? `Hi ${firstName}, ` : ""}payment received. Please find your official MedMinds receipt attached${balance > 0 ? `; remaining balance K${balance.toLocaleString()}` : ""}.`;
  const result = await sendClientDocument({ kind: "receipt", phone: input.lead.phone, clientName: input.lead.name,
    documentNumber: number, detail: paid.toFixed(2), pdf, filename, caption,
    forceTemplate: input.forceTemplate, phoneNumberIdOverride: input.phoneNumberIdOverride });
  await addMessage(input.lead.phone, "assistant", `[Branded PDF receipt submitted: ${filename}]`, result.messageId);
  await recordOutgoingMessageAccepted({ phone: input.lead.phone, messageId: result.messageId }).catch(() => undefined);
  return { sent: true, receipt: number, filename, messageId: result.messageId, totalChargedZmw: total, amountPaidZmw: paid, balanceZmw: balance };
}
