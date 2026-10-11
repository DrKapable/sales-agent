import { getConversation } from "@/lib/store";
import { clientDocumentTemplateStatus, hasDocumentHeader, type ClientDocumentKind } from "@/lib/client-document-templates";
import { sendApprovedMetaTemplate } from "@/lib/meta-templates";
import { sendWhatsAppPdfDocument, uploadWhatsAppPdf } from "@/lib/whatsapp";

export async function clientDocumentSessionOpen(phone: string, now = Date.now()) {
  const history = await getConversation(phone, 100);
  const latest = [...history].reverse().find((message) => message.role === "user");
  const age = latest ? now - new Date(latest.createdAt).getTime() : NaN;
  return Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000;
}

export async function sendClientDocument(input: {
  kind: ClientDocumentKind; phone: string; clientName?: string | null;
  documentNumber: string; detail: string; pdf: Uint8Array; filename: string;
  caption: string; phoneNumberIdOverride?: string;
  forceTemplate?: boolean;
}) {
  if (!input.forceTemplate && await clientDocumentSessionOpen(input.phone)) return sendWhatsAppPdfDocument(input);
  const template = await clientDocumentTemplateStatus(input.kind);
  if (template?.status !== "APPROVED" || !hasDocumentHeader(template)) {
    throw new Error(`The MedMinds ${input.kind} PDF template must be APPROVED by Meta before sending (current status: ${template?.status || "NOT_SUBMITTED"}). The document remains saved.`);
  }
  const { mediaId } = await uploadWhatsAppPdf(input);
  const text = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 500);
  const result = await sendApprovedMetaTemplate({
    phone: input.phone, name: template.name, language: template.language,
    phoneNumberIdOverride: input.phoneNumberIdOverride,
    components: [
      { type: "header", parameters: [{ type: "document", document: { id: mediaId, filename: input.filename } }] },
      { type: "body", parameters: [input.clientName || "Client", input.documentNumber, input.detail].map((value) => ({ type: "text" as const, text: text(value) })) }
    ]
  });
  return { ...result, mediaId };
}
