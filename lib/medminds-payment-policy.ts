export const MEDMINDS_BANK = {
  bank: "First National Bank (FNB) Zambia",
  accountName: "MEDMINDS GENERAL DEALERS",
  accountNumber: "63226093902",
  accountType: "Business Cheque Account - Kwacha",
  branch: "Livingstone",
  branchCode: "261061",
  swift: "FIRNZMLX",
} as const;

export const MEDMINDS_BANK_TEXT = `Bank: ${MEDMINDS_BANK.bank}\nAccount name: ${MEDMINDS_BANK.accountName}\nAccount number: ${MEDMINDS_BANK.accountNumber}\nAccount type: ${MEDMINDS_BANK.accountType}\nBranch: ${MEDMINDS_BANK.branch} | Branch code: ${MEDMINDS_BANK.branchCode}\nSWIFT: ${MEDMINDS_BANK.swift}`;

export function isTaskBasedService(service: string) {
  return !/\b(course|membership|subscription|qbank|exam prep|complete plan|premium plan|ai[- ](?:assisted research proposal writing|enhanced research writing)|master(?:ing)? (?:ecg|chest x[- ]?ray) interpretation|data collection using kobotoolbox|osce high[- ]yield revision session|create digital surveys with chatgpt)\b/i.test(service);
}

export function commercialPaymentAmount(record: { service: string; status: string; amount_zmw?: number | string | null; balance_zmw?: number | string | null }) {
  const total = Number(record.amount_zmw);
  if (!Number.isFinite(total) || total <= 0) return null;
  const amount = record.status === "INVOICE_UNPAID"
    ? Number(record.balance_zmw ?? total)
    : isTaskBasedService(record.service) ? total / 2 : total;
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

export function quotationPaymentUrl(id: string) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://sales.medmindslc.online").replace(/\/$/, "");
  return `${origin}/pay/${encodeURIComponent(id)}`;
}

export function quotationPaymentReference(record: { id: string }, amount: number) {
  return `quotation:${record.id}:${amount.toFixed(2)}`;
}

export function approvedPaymentInstructions() {
  return `${MEDMINDS_BANK_TEXT}\nAlternatively, use the open custom Sampay link on your MedMinds quotation. No client email or phone is required to create or open the link. The payer enters their payment details at checkout. Never pay a personal mobile-money number.`;
}
