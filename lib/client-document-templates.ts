import { createCommercialPdf } from "@/lib/commercial-pdf";
import { createBrandedReceiptPdf } from "@/lib/receipt-pdf";
import { sanitizeWhatsAppApiError } from "@/lib/whatsapp";
import type { MetaTemplate } from "@/lib/meta-templates";

export const CLIENT_DOCUMENT_TEMPLATES = {
  quotation: {
    name: "medminds_client_quotation_pdf_v1",
    text: "Hello {{1}}, your requested MedMinds quotation {{2}} for {{3}} is attached. Please review the document and reply with any questions.",
    example: ["Sample Client", "QUO-SAMPLE", "Research proposal support"]
  },
  receipt: {
    name: "medminds_client_receipt_pdf_v1",
    text: "Hello {{1}}, your MedMinds payment receipt {{2}} for ZMW {{3}} is attached. Thank you.",
    example: ["Sample Client", "MM-SAMPLE", "1750.00"]
  }
} as const;
export type ClientDocumentKind = keyof typeof CLIENT_DOCUMENT_TEMPLATES;
export const CLIENT_DOCUMENT_LANGUAGE = "en_US";
type TemplateStatus = MetaTemplate & { rejected_reason?: string };

function config() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  const businessId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_WABA_ID;
  if (!token || !version || !businessId) throw new Error("Client document template management is not configured.");
  return { token, version, businessId };
}

async function graph<T>(url: string | URL, init: RequestInit = {}): Promise<T> {
  const { token } = config();
  const response = await fetch(url, {
    ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers },
    cache: "no-store", signal: AbortSignal.timeout(20000)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Client document template API returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(raw))}`);
  return JSON.parse(raw) as T;
}

export async function clientDocumentTemplateStatus(kind: ClientDocumentKind) {
  const { version, businessId } = config();
  const url = new URL(`https://graph.facebook.com/${version}/${businessId}/message_templates`);
  url.searchParams.set("name", CLIENT_DOCUMENT_TEMPLATES[kind].name);
  url.searchParams.set("fields", "id,name,status,language,category,components,rejected_reason");
  const result = await graph<{ data?: TemplateStatus[] }>(url);
  return result.data?.find((item) => item.name === CLIENT_DOCUMENT_TEMPLATES[kind].name && item.language === CLIENT_DOCUMENT_LANGUAGE) || null;
}

export function hasDocumentHeader(template: Pick<MetaTemplate, "components">) {
  return template.components?.some((component) => component.type.toUpperCase() === "HEADER" && component.format?.toUpperCase() === "DOCUMENT") || false;
}

function samplePdf(kind: ClientDocumentKind) {
  // Approval examples contain fictional data and are never stored as financial records.
  return kind === "quotation" ? createCommercialPdf({
    kind, documentNumber: "QUO-SAMPLE-ONLY", clientName: "SAMPLE ONLY - Not a client quotation",
    service: "Sample research proposal support", amountZmw: 1750,
    details: "SAMPLE ONLY. Fictional quotation supplied solely for Meta template approval. Not valid for payment."
  }) : createBrandedReceiptPdf({
    receiptNumber: "MM-SAMPLE-ONLY", clientName: "SAMPLE ONLY - Not proof of payment", amountZmw: 1750,
    service: "SAMPLE ONLY - Fictional receipt for Meta approval", paymentReference: "SAMPLE - NO PAYMENT",
    verifiedBy: "SAMPLE ONLY"
  });
}

async function uploadApprovalSample(kind: ClientDocumentKind) {
  const { token, version } = config();
  const pdf = samplePdf(kind);
  const url = new URL(`https://graph.facebook.com/${version}/app/uploads`);
  url.searchParams.set("file_length", String(pdf.byteLength));
  url.searchParams.set("file_type", "application/pdf");
  url.searchParams.set("file_name", `MedMinds-${kind}-SAMPLE-ONLY.pdf`);
  const session = await graph<{ id?: string }>(url, { method: "POST" });
  if (!session.id?.startsWith("upload:")) throw new Error("Meta did not return an approval sample upload session.");
  const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  const result = await graph<{ h?: string }>(`https://graph.facebook.com/${version}/${session.id}`, {
    method: "POST", headers: { Authorization: `OAuth ${token}`, "file_offset": "0", "Content-Type": "application/pdf" }, body: bytes
  });
  if (!result.h) throw new Error("Meta did not return a document approval sample handle.");
  return result.h;
}

export async function ensureClientDocumentTemplate(kind: ClientDocumentKind) {
  const existing = await clientDocumentTemplateStatus(kind);
  if (existing) {
    if (!hasDocumentHeader(existing)) throw new Error(`Existing ${kind} template does not have a DOCUMENT header.`);
    return existing;
  }
  const definition = CLIENT_DOCUMENT_TEMPLATES[kind];
  const handle = await uploadApprovalSample(kind);
  const { version, businessId } = config();
  const result = await graph<{ id?: string; status?: string; category?: string }>(`https://graph.facebook.com/${version}/${businessId}/message_templates`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: definition.name, language: CLIENT_DOCUMENT_LANGUAGE, category: "UTILITY", components: [
      { type: "HEADER", format: "DOCUMENT", example: { header_handle: [handle] } },
      { type: "BODY", text: definition.text, example: { body_text: [definition.example] } }
    ] })
  });
  if (!result.id) throw new Error("Meta did not return a submitted template ID.");
  return { ...result, name: definition.name, language: CLIENT_DOCUMENT_LANGUAGE, status: result.status || "PENDING" };
}

export async function clientDocumentTemplateResults(ensure = false) {
  const results = [];
  for (const kind of Object.keys(CLIENT_DOCUMENT_TEMPLATES) as ClientDocumentKind[]) {
    try {
      results.push({ kind, template: await (ensure ? ensureClientDocumentTemplate(kind) : clientDocumentTemplateStatus(kind)) });
    } catch (error) {
      results.push({ kind, error: error instanceof Error ? error.message : "Template operation failed." });
    }
  }
  return results;
}
