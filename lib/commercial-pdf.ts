import { buildPdfWithOfficialLogo, officialLogoDrawCommand } from "@/lib/pdf-brand";

type CommercialDocumentInput = {
  kind: "quotation" | "invoice";
  documentNumber: string;
  clientName: string;
  service: string;
  amountZmw?: number | null;
  details: string;
  issuedAt?: string | null;
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
  const title = input.kind === "invoice" ? "UNPAID INVOICE" : "QUOTATION";
  const status = input.kind === "invoice" ? "PAYMENT DUE" : "VALID QUOTATION";
  const titleX = input.kind === "invoice" ? 430 : 458;
  const pageWidth = 595;
  const detailLines = wrap(input.details || input.service);
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
    `${pale} rg 42 514 511 104 re f`,
    line(input.kind === "invoice" ? "AMOUNT DUE" : "QUOTED AMOUNT", 62, 587, 9, "F2", muted),
    line(money(input.amountZmw), 62, 548, 30, "F2", navy),
    line(status, 408, 570, 10, "F2", input.kind === "invoice" ? "0.72 0.38 0.05" : teal),
    line("MedMinds Learning Centre", 403, 548, 9, "F1", muted),
    line("Client", 42, 470, 9, "F2", muted),
    line(input.clientName || "Not provided", 210, 470, 11, "F1", navy),
    "0.86 0.9 0.92 RG 0.8 w 42 454 m 553 454 l S",
    line("Service", 42, 425, 9, "F2", muted),
    line(input.service || "MedMinds service", 210, 425, 11, "F1", navy),
    "0.86 0.9 0.92 RG 0.8 w 42 409 m 553 409 l S",
    line("Details", 42, 380, 9, "F2", muted)
  ];
  detailLines.forEach((row, index) => content.push(line(row, 210, 380 - index * 17, 10, "F1", navy)));
  content.push(
    `${teal} rg 42 216 511 2 re f`,
    line(input.kind === "invoice" ? "This invoice remains unpaid until payment is verified by MedMinds." : "This quotation is based on the approved MedMinds service and price recorded above.", 42, 185, 10, "F2", navy),
    line("Payment details and any applicable conditions should be confirmed before payment.", 42, 161, 9, "F1", muted),
    line("MedMinds Learning Centre", 42, 80, 9, "F2", navy),
    line("WhatsApp: +260 762 402042", 42, 64, 8, "F1", muted),
    line(`Document ID: ${input.documentNumber}`, 390, 64, 8, "F1", muted),
    "Q"
  );

  return buildPdfWithOfficialLogo(content.join("\n"));
}
