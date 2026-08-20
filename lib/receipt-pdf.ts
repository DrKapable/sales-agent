import { MEDMINDS_BUSINESS_IDENTITY } from "@/lib/business-identity";
import { buildPdfWithOfficialLogo, officialLogoDrawCommand } from "@/lib/pdf-brand";

type ReceiptInput = {
  receiptNumber: string;
  clientName: string;
  amountZmw: number;
  totalChargedZmw?: number | null;
  balanceZmw?: number | null;
  paymentReference?: string | null;
  verifiedAt?: string | null;
  service?: string | null;
  verifiedBy?: string | null;
};

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

function money(value: number) {
  return `K${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "Not available";
}

function line(text: string, x: number, y: number, size = 11, font = "F1", color = "0.125 0.227 0.353") {
  return `BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj ET`;
}

export function createBrandedReceiptPdf(input: ReceiptInput) {
  const navy = "0.125 0.227 0.353";
  const teal = "0.184 0.682 0.624";
  const muted = "0.38 0.47 0.54";
  const pale = "0.93 0.97 0.97";
  const pageWidth = 595;
  const total = Number(input.totalChargedZmw ?? input.amountZmw);
  const paid = Number(input.amountZmw);
  const balance = Number(input.balanceZmw ?? Math.max(total - paid, 0));

  const content = [
    "q",
    "1 1 1 rg 0 730 595 112 re f",
    officialLogoDrawCommand(36, 734, 250, 114),
    line("OFFICIAL PAYMENT RECEIPT", 385, 787, 10, "F2", navy),
    `${navy} rg 0 727 ${pageWidth} 5 re f`,
    `${teal} rg 0 722 ${pageWidth} 5 re f`,
    line("Receipt", 42, 688, 28, "F2", navy),
    line(input.receiptNumber, 42, 662, 12, "F2", teal),
    line(`Issued ${dateLabel(input.verifiedAt)}`, 42, 642, 9, "F1", muted),

    `${pale} rg 42 514 511 104 re f`,
    line("TOTAL CHARGED", 60, 588, 8, "F2", muted),
    line(money(total), 60, 555, 17, "F2", navy),
    line("AMOUNT PAID", 223, 588, 8, "F2", muted),
    line(money(paid), 223, 555, 17, "F2", teal),
    line("BALANCE", 386, 588, 8, "F2", muted),
    line(money(balance), 386, 555, 17, "F2", balance > 0 ? "0.72 0.38 0.05" : teal),
    line(balance > 0 ? "PART PAYMENT" : "PAID IN FULL", 414, 528, 9, "F2", balance > 0 ? "0.72 0.38 0.05" : teal),

    line("Client", 42, 470, 9, "F2", muted),
    line(input.clientName || "Not provided", 210, 470, 11, "F1", navy),
    "0.86 0.9 0.92 RG 0.8 w 42 454 m 553 454 l S",
    line("Service", 42, 425, 9, "F2", muted),
    line(input.service || "MedMinds service", 210, 425, 11, "F1", navy),
    "0.86 0.9 0.92 RG 0.8 w 42 409 m 553 409 l S",
    line("Payment reference", 42, 380, 9, "F2", muted),
    line(input.paymentReference || "Not provided", 210, 380, 11, "F1", navy),
    "0.86 0.9 0.92 RG 0.8 w 42 364 m 553 364 l S",
    line("Verified by", 42, 335, 9, "F2", muted),
    line(input.verifiedBy || "MedMinds Administration", 210, 335, 11, "F1", navy),
    "0.86 0.9 0.92 RG 0.8 w 42 319 m 553 319 l S",
    line("Verification date", 42, 290, 9, "F2", muted),
    line(dateLabel(input.verifiedAt), 210, 290, 11, "F1", navy),

    `${teal} rg 42 216 511 2 re f`,
    line("Thank you for choosing MedMinds.", 42, 185, 12, "F2", navy),
    line(balance > 0 ? "This receipt confirms the payment above; the remaining balance is shown on this document." : "This receipt confirms that the recorded charge shown above has been fully paid.", 42, 162, 8.5, "F1", muted),
    line(MEDMINDS_BUSINESS_IDENTITY.legalName, 42, 112, 8.2, "F2", navy),
    line(`TPIN: ${MEDMINDS_BUSINESS_IDENTITY.tpin}`, 42, 97, 7.8, "F1", muted),
    line(MEDMINDS_BUSINESS_IDENTITY.physicalAddress, 42, 82, 7.2, "F1", muted),
    line("WhatsApp: +260 762 402042", 42, 64, 7.5, "F1", muted),
    line(`Receipt ID: ${input.receiptNumber}`, 390, 64, 7.5, "F1", muted),
    "Q"
  ].join("\n");

  return buildPdfWithOfficialLogo(content);
}
