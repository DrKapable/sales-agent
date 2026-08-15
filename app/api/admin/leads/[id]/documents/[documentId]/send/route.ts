import { NextResponse } from "next/server";
import { z } from "zod";
import { clientDocumentChatContent, getClientDocumentForLead, listClientDocuments, markClientDocumentSent } from "@/lib/client-documents";
import { sendClientWhatsAppDocument } from "@/lib/client-document-whatsapp";
import { humanMessageContent, replyWindow } from "@/lib/conversation";
import { decorateMessagesForAdmin, recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { addMessage, getConversation, listLeads, updateLead } from "@/lib/store";
import { staffNames } from "@/lib/team-directory";
import { getWhatsAppSender } from "@/lib/whatsapp-sender-context";

const schema = z.object({
  sender: z.enum(staffNames),
  caption: z.string().trim().max(1024).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const [{ id, documentId }, parsed] = await Promise.all([
    params,
    request.json().catch(() => null).then((body) => schema.safeParse(body))
  ]);
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid staff sender." }, { status: 400 });

  const lead = (await listLeads()).find((item) => item.id === id);
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!lead.aiPaused) return NextResponse.json({ error: "Take over this conversation before sending a document manually." }, { status: 409 });

  const messagesBefore = await getConversation(lead.phone, 100);
  const window = replyWindow(messagesBefore);
  if (lead.source === "whatsapp" && !window.open) {
    return NextResponse.json({ error: "The 24-hour WhatsApp reply window has closed. An approved Meta template is required before sending this document." }, { status: 409 });
  }

  const document = await getClientDocumentForLead(documentId, lead.id);
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
      console.error("Admin WhatsApp document send failed", { leadId: lead.id, documentId, error });
      return NextResponse.json({ error: "Meta did not accept this WhatsApp document. Check the production log for the specific reason." }, { status: 502 });
    }
  }

  const chatContent = clientDocumentChatContent({ title: document.title, fileName: document.fileName, caption: parsed.data.caption });
  await addMessage(lead.phone, "assistant", humanMessageContent(parsed.data.sender, chatContent), externalId);
  if (externalId) {
    await recordOutgoingMessageAccepted({ messageId: externalId, phone: lead.phone }).catch((error) => console.warn("Unable to record document delivery acceptance", { leadId: lead.id, documentId, error }));
  }
  await markClientDocumentSent(document.id, lead.id);
  const updatedLead = await updateLead(lead.phone, { aiPaused: true, assignedTo: parsed.data.sender, status: "HUMAN ASSISTANCE REQUIRED" });
  const storedMessages = await getConversation(lead.phone, 100);
  const messages = await decorateMessagesForAdmin(storedMessages);
  return NextResponse.json({
    lead: updatedLead,
    messages,
    documents: await listClientDocuments(lead.id),
    replyWindow: replyWindow(storedMessages),
    delivery
  });
}
