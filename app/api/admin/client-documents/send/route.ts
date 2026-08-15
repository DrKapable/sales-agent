import { NextResponse } from "next/server";
import { z } from "zod";
import { clientDocumentChatContent, getClientDocumentForLead, getClientDocumentUsage, listClientDocuments, markClientDocumentSent } from "@/lib/client-documents";
import { sendClientWhatsAppDocument } from "@/lib/client-document-whatsapp";
import { humanMessageContent, replyWindow } from "@/lib/conversation";
import { decorateMessagesForAdmin, recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { addMessage, getConversation, listLeads, updateLead } from "@/lib/store";
import { staffNames } from "@/lib/team-directory";
import { getWhatsAppSender } from "@/lib/whatsapp-sender-context";

const schema = z.object({
  phone: z.string().trim().min(8).max(40),
  documentId: z.string().uuid(),
  sender: z.enum(staffNames),
  caption: z.string().trim().max(1024).optional()
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid document send request." }, { status: 400 });
  const digits = parsed.data.phone.replace(/\D/g, "");
  const lead = (await listLeads()).find((item) => item.phone.replace(/\D/g, "") === digits);
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!lead.aiPaused) return NextResponse.json({ error: "Take over this conversation before sending a document manually." }, { status: 409 });

  const messagesBefore = await getConversation(lead.phone, 100);
  const window = replyWindow(messagesBefore);
  if (lead.source === "whatsapp" && !window.open) return NextResponse.json({ error: "The 24-hour WhatsApp reply window has closed. An approved Meta template is required before sending this document." }, { status: 409 });
  const document = await getClientDocumentForLead(parsed.data.documentId, lead.id);
  if (!document) return NextResponse.json({ error: "This document is not assigned to this client." }, { status: 404 });

  let externalId: string | null = null;
  let delivery: { status: "accepted" | "simulated"; messageId: string | null } = { status: "simulated", messageId: null };
  if (lead.source === "whatsapp") {
    try {
      const senderContext = await getWhatsAppSender(lead.phone);
      const sent = await sendClientWhatsAppDocument({
        phone: lead.phone,
        bytes: document.bytes,
        filename: document.fileName,
        mimeType: document.mimeType,
        caption: parsed.data.caption,
        phoneNumberIdOverride: senderContext?.phoneNumberId
      });
      externalId = sent.messageId;
      delivery = { status: "accepted", messageId: sent.messageId };
    } catch (error) {
      console.error("Admin WhatsApp document resend failed", { leadId: lead.id, documentId: document.id, error });
      return NextResponse.json({ error: "Meta did not accept this WhatsApp document. Nothing was marked as sent. Check the production log for the specific reason." }, { status: 502 });
    }
  }

  await addMessage(lead.phone, "assistant", humanMessageContent(parsed.data.sender, clientDocumentChatContent({ title: document.title, fileName: document.fileName, caption: parsed.data.caption })), externalId);
  if (externalId) await recordOutgoingMessageAccepted({ messageId: externalId, phone: lead.phone }).catch(() => undefined);
  await markClientDocumentSent(document.id, lead.id, parsed.data.sender);
  const updatedLead = await updateLead(lead.phone, { aiPaused: true, assignedTo: parsed.data.sender, status: "HUMAN ASSISTANCE REQUIRED" });
  const messages = await getConversation(lead.phone, 100);
  const [documents, usage] = await Promise.all([listClientDocuments(lead.id), getClientDocumentUsage(lead.id)]);
  return NextResponse.json({
    lead: updatedLead,
    messages: await decorateMessagesForAdmin(messages),
    documents,
    usage,
    replyWindow: replyWindow(messages),
    delivery
  });
}
