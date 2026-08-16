import { attachmentDisplayName, parseClientAttachmentChatContent } from "@/lib/client-attachment-content";
import { referralRecipients } from "@/lib/referrals";
import { addMessage, getOrCreateLead, updateLead } from "@/lib/store";
import { sendWhatsAppText } from "@/lib/whatsapp";

const HUMAN_TAKEOVER_PREFIX = "[HUMAN TAKEOVER]";
const KANYEMBO = "Dr Kanyembo Ng'andwe";

function contact(phone: string) {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

function referralBody(input: {
  copyLabel: "PRIMARY" | "CC";
  recipientName: string;
  clientName: string | null;
  phone: string;
  fileName: string;
  mimeType: string | null;
  caption: string | null;
}) {
  return [
    `Client document referral (${input.copyLabel})`,
    `For: ${input.recipientName}`,
    `Assigned to: ${KANYEMBO}`,
    `Client: ${input.clientName || "Not provided"}`,
    `WhatsApp: ${contact(input.phone)}`,
    `Document: ${input.fileName}`,
    `Type: ${input.mimeType || "Not provided"}`,
    input.caption ? `Client caption: ${input.caption}` : null,
    "Action: Review the attachment in the MedMinds admin chat and follow up with the client."
  ].filter(Boolean).join("\n");
}

export async function handleIncomingClientAttachment(phone: string, text: string) {
  const attachment = parseClientAttachmentChatContent(text);
  if (!attachment) return null;

  const lead = await getOrCreateLead(phone, "whatsapp");
  const fileName = attachmentDisplayName(attachment);

  if (attachment.kind !== "document") {
    const reply = `I've received your ${attachment.kind}${attachment.caption ? ` and the note “${attachment.caption.slice(0, 180)}”` : ""}. Please tell me what you would like us to do with it, and I’ll assist you.`;
    await addMessage(phone, "assistant", reply);
    return { reply, referralNotification: null, documentIds: [] };
  }

  const reason = `${HUMAN_TAKEOVER_PREFIX} Client sent document ${fileName}. Referred to ${KANYEMBO}; Director copied.`;
  const savedLead = await updateLead(phone, {
    status: "HUMAN ASSISTANCE REQUIRED",
    handoffReason: reason,
    aiPaused: true,
    assignedTo: KANYEMBO
  });

  const recipients = [
    { ...referralRecipients.kanyembo, copyLabel: "PRIMARY" as const },
    { ...referralRecipients.mustafa, copyLabel: "CC" as const }
  ];

  const notificationResults = await Promise.allSettled(recipients.map(async (recipient) => {
    if (!recipient.phone) return false;
    await sendWhatsAppText(recipient.phone, referralBody({
      copyLabel: recipient.copyLabel,
      recipientName: recipient.name,
      clientName: savedLead.name,
      phone: savedLead.phone,
      fileName,
      mimeType: attachment.mimeType,
      caption: attachment.caption
    }));
    return true;
  }));

  notificationResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("Client document referral notification failed", {
        recipient: recipients[index]?.name,
        phoneSuffix: phone.slice(-4),
        error: result.reason
      });
    }
  });

  const reply = `Thank you, I've received your document, ${fileName}. I've referred it to ${KANYEMBO} for review and copied our Director, Dr. Mustafa Juma Phiri. They will follow up with you shortly.`;
  await addMessage(phone, "assistant", reply);
  return { reply, referralNotification: null, documentIds: [] };
}
