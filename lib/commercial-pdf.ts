import { MEDMINDS_BUSINESS_IDENTITY } from "@/lib/business-identity";
import { buildPdfWithOfficialLogo, officialLogoDrawCommand } from "@/lib/pdf-brand";
import { MEDMINDS_BANK } from "@/lib/medminds-payment-policy";

type CommercialDocumentInput = {
  kind: "quotation" | "invoice";
  documentNumber: string;
  clientName: string;
  service: string;
  amountZmw?: number | null;
  totalChargedZmw?: number | null;
  amountPaidZmw?: number | null;
  balanceZmw?: number | null;
  details: string;
  issuedAt?: string | null;
  paymentUrl?: string;
  paymentAmountZmw?: number | null;
  deposit?: boolean;
};

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

function line(text: string, x: number, y: number, size = 11, font = "F1", color = "0.125 0.227 0.353") {
  return `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj ET`;
}

function money(value?: number | null) {
  return value == null ? "Tailored quotation" : `K${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "Not available";
}

function wrap(text: string, width = 72) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) { rows.push(current); current = word; }
    else current = next;
  }
  if (current) rows.push(current);
  return rows.slice(0, 8);
}

export function createCommercialPdf(input: CommercialDocumentInput) {
  const navy = "0.125 0.227 0.353";
  const teal = "0.184 0.682 0.624";
  const muted = "0.38 0.47 0.54";
  const pale = "0.93 0.97 0.97";
  const title = input.kind === "invoice" ? "INVOICE" : "QUOTATION";
  const status = input.kind === "invoice" ? "BALANCE DUE" : "VALID QUOTATION";
  const titleX = input.kind === "invoice" ? 472 : 458;
  const pageWidth = 595;
  const detailLines = wrap(input.details || input.service);
  const totalCharged = input.totalChargedZmw ?? input.amountZmw ?? null;
  const amountPaid = input.kind === "invoice" ? Number(input.amountPaidZmw ?? 0) : null;
  const balance = input.kind === "invoice"
    ? Number(input.balanceZmw ?? Math.max(Number(totalCharged ?? 0) - Number(amountPaid ?? 0), 0))
    : null;
  const content: string[] = [
    "q",
    "1 1 1 rg 0 730 595 112 re f",
    officialLogoDrawCommand(36, 734, 250, 114),
    line(title, titleX, 787, 10, "F2", navy),
    `${navy} rg 0 727 ${pageWidth} 5 re f`,
    `${teal} rg 0 722 ${pageWidth} 5 re f`,
    line(input.kind === "invoice" ? "Invoice" : "Quotation", 42, 688, 28, "F2", navy),
    line(input.documentNumber, 42, 662, 12, "F2", teal),
    line(`Issued ${dateLabel(input.issuedAt)}`, 42, 642, 9, "F1", muted),
    `${pale} rg 42 514 511 104 re f`
  ];

  if (input.kind === "invoice") {
    content.push(
      line("TOTAL CHARGED", 60, 588, 8, "F2", muted),
      line(money(totalCharged), 60, 555, 17, "F2", navy),
      line("AMOUNT PAID", 223, 588, 8, "F2", muted),
      line(money(amountPaid), 223, 555, 17, "F2", teal),
      line("BALANCE", 386, 588, 8, "F2", muted),
      line(money(balance), 386, 555, 17, "F2", balance && balance > 0 ? "0.72 0.38 0.05" : teal),
      line(status, 430, 528, 9, "F2", balance && balance > 0 ? "0.72 0.38 0.05" : teal)
    );
  } else {
    content.push(
      line("QUOTED AMOUNT", 62, 587, 9, "F2", muted),
      line(money(input.amountZmw), 62, 548, 30, "F2", navy),
      line(status, 408, 570, 10, "F2", teal),
      line("MedMinds Learning Centre", 403, 548, 9, "F1", muted)
    );
  }

  content.push(
    line("Client", 42, 470, 9, "F2", muted),
    line(input.clientName || "Not provided", 210, 470, 11, "F1", navy),
    "0.86 0.9 0.92 RG 0.8 w 42 454 m 553 454 l S",
    line("Service", 42, 425, 9, "F2", muted),
    line(input.service || "MedMinds service", 210, 425, 11, "F1", navy),
    "0.86 0.9 0.92 RG 0.8 w 42 409 m 553 409 l S",
    line("Details", 42, 380, 9, "F2", muted)
  );
  detailLines.forEach((row, index) => content.push(line(row, 210, 380 - index * 17, 10, "F1", navy)));
  content.push(
    `${teal} rg 42 245 511 2 re f`,
    line("PAYMENT OPTIONS", 42, 227, 9, "F2", teal),
    line(`Bank: ${MEDMINDS_BANK.bank} | Account: ${MEDMINDS_BANK.accountName}`, 42, 209, 8.5, "F2", navy),
    line(`Account number: ${MEDMINDS_BANK.accountNumber} | ${MEDMINDS_BANK.accountType}`, 42, 194, 8.5, "F1", navy),
    line(`Branch: ${MEDMINDS_BANK.branch} | Code: ${MEDMINDS_BANK.branchCode} | SWIFT: ${MEDMINDS_BANK.swift}`, 42, 179, 8.5, "F1", navy),
    line(input.deposit && input.paymentAmountZmw ? `50% deposit: ${money(input.paymentAmountZmw)}. Remaining 50% on completion.` : input.paymentAmountZmw ? `Amount payable: ${money(input.paymentAmountZmw)}.` : "A final payable amount must be approved before payment.", 42, 161, 9, "F2", navy),
    line("Mobile Money / card: open the custom Sampay payment link below.", 42, 143, 8.5, "F1", navy),
    line(input.paymentUrl || "A payment link is issued once the payable amount is approved.", 42, 127, 7.5, "F1", teal),
    line("No email or phone is needed to create or open the link. Enter payer details at checkout.", 42, 111, 8, "F1", muted),
    line("Sampay processing charges are shown at checkout. Use the document number as bank reference.", 42, 97, 8, "F1", muted),
    line(MEDMINDS_BUSINESS_IDENTITY.legalName, 42, 70, 8.2, "F2", navy),
    line(`TPIN: ${MEDMINDS_BUSINESS_IDENTITY.tpin}`, 42, 55, 7.8, "F1", muted),
    line(MEDMINDS_BUSINESS_IDENTITY.physicalAddress, 42, 40, 7.2, "F1", muted),
    line(`Document ID: ${input.documentNumber}`, 390, 55, 7.5, "F1", muted),
    "Q"
  );

  return buildPdfWithOfficialLogo(content.join("\n"), input.paymentUrl ? [{ url: input.paymentUrl, rect: [42, 124, 553, 139] }] : []);
}
