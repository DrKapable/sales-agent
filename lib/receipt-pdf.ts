type ReceiptInput = {
  receiptNumber: string;
  clientName: string;
  amountZmw: number;
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
  const pageHeight = 842;

  const content = [
    "q",
    `${navy} rg 0 742 ${pageWidth} 100 re f`,
    `${teal} rg 0 732 ${pageWidth} 10 re f`,

    // Simplified MedMinds brand mark
    `${teal} rg 42 775 26 12 re f`,
    `${teal} rg 49 768 12 26 re f`,
    `${navy} RG 4 w 35 764 m 35 798 79 804 102 780 c S`,
    line("MED-MINDS", 118, 792, 19, "F2", "1 1 1"),
    line("Learning Centre", 119, 773, 10, "F1", "0.86 0.93 0.96"),
    line("OFFICIAL PAYMENT RECEIPT", 367, 784, 10, "F2", "1 1 1"),

    line("Receipt", 42, 688, 28, "F2", navy),
    line(input.receiptNumber, 42, 662, 12, "F2", teal),
    line(`Issued ${dateLabel(input.verifiedAt)}`, 42, 642, 9, "F1", muted),

    `${pale} rg 42 514 511 104 re f`,
    line("PAYMENT RECEIVED", 62, 587, 9, "F2", muted),
    line(money(input.amountZmw), 62, 548, 30, "F2", navy),
    line("Verified payment", 403, 570, 10, "F2", teal),
    line("MedMinds Learning Centre", 403, 548, 9, "F1", muted),

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
    line("This receipt confirms a payment recorded and verified in the MedMinds system.", 42, 161, 9, "F1", muted),
    line("Keep this document for your records.", 42, 145, 9, "F1", muted),

    line("MedMinds Learning Centre", 42, 80, 9, "F2", navy),
    line("WhatsApp: +260 762 402042", 42, 64, 8, "F1", muted),
    line(`Receipt ID: ${input.receiptNumber}`, 390, 64, 8, "F1", muted),
    "Q"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];

  let pdf = "%PDF-1.4\n%MedMinds\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}
