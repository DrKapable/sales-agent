import { after, NextRequest, NextResponse } from "next/server";
import { clientDocumentChatContent, getClientDocumentForLead, markClientDocumentSent } from "@/lib/client-documents";
import { sendClientWhatsAppDocument } from "@/lib/client-document-whatsapp";
import { addMessage, getConversation, getOrCreateLead, updateLead } from "@/lib/store";
import { humanReplyDelayMs, wait } from "@/lib/timing";
import { generateWhatsAppReplyWithRecovery, sendWhatsAppTextWithRetry } from "@/lib/whatsapp-recovery";
import { parseDeliveryReceipts, parseIncomingMessages, sendWhatsAppText, sendWhatsAppTypingIndicator, verifyWhatsAppSignature } from "@/lib/whatsapp";
import { notifyDirectorOfNewClient } from "@/lib/new-client-alert";
import { sendCommercialPdf } from "@/lib/commercial-document";
import { getLatestPreparedQuotation, isPreparedQuotationRequest, preparedQuotationFallbackText } from "@/lib/prepared-quotation";
import { rememberWhatsAppSender } from "@/lib/whatsapp-sender-context";
import { applyQuoteDeliveryReceipt } from "@/lib/quotation-delivery";
import { applyMessageDeliveryReceipt, recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { attachOutgoingMessageId } from "@/lib/outgoing-message-link";

const HUMAN_TAKEOVER_PREFIX = "[HUMAN TAKEOVER]";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && challenge && token === process.env.WHATSAPP_VERIFY_TOKEN) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const messages = parseIncomingMessages(payload);
  const deliveryReceipts = parseDeliveryReceipts(payload);

  after(async () => {
    for (const receipt of deliveryReceipts) {
      try {
        const [quoteMatched, messageMatched] = await Promise.all([
          applyQuoteDeliveryReceipt({
            messageId: receipt.id,
            status: receipt.status,
            timestamp: receipt.timestamp,
            error: receipt.error
          }),
          applyMessageDeliveryReceipt({
            messageId: receipt.id,
            status: receipt.status,
            recipientId: receipt.recipientId,
            error: receipt.error
          })
        ]);
        if (quoteMatched) console.info("Quotation delivery receipt recorded", { messageId: receipt.id, status: receipt.status });
        if (messageMatched) console.info("WhatsApp chat delivery receipt recorded", { messageId: receipt.id, status: receipt.status });
      } catch (error) {
        console.error("Unable to record WhatsApp delivery receipt", { messageId: receipt.id, status: receipt.status, error });
      }
    }

    for (const message of messages) {
      const processingStartedAt = Date.now();
      try {
        console.info("WhatsApp message received", { messageId: message.id, phoneSuffix: message.phone.slice(-4) });

        const configuredPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (message.phoneNumberId && configuredPhoneNumberId && message.phoneNumberId !== configuredPhoneNumberId) {
          console.warn("WhatsApp phone number ID mismatch; using webhook phone number ID", {
            webhookPhoneNumberIdSuffix: message.phoneNumberId.slice(-4),
            configuredPhoneNumberIdSuffix: configuredPhoneNumberId.slice(-4)
          });
        }

        await rememberWhatsAppSender({ phone: message.phone, phoneNumberId: message.phoneNumberId, displayPhoneNumber: message.displayPhoneNumber })
          .catch((error) => console.error("Unable to remember WhatsApp sender context", { phoneSuffix: message.phone.slice(-4), error }));

        const previousHistory = await getConversation(message.phone, 1);
        const firstEverClientMessage = previousHistory.length === 0;
        const isNew = await addMessage(message.phone, "user", message.text, message.id);
        if (!isNew) continue;

        let lead = message.name
          ? await updateLead(message.phone, { name: message.name })
          : await getOrCreateLead(message.phone, "whatsapp");

        if (lead.aiPaused) {
          const markedHumanTakeover = lead.handoffReason?.startsWith(HUMAN_TAKEOVER_PREFIX) ?? false;
          const history = markedHumanTakeover ? [] : await getConversation(message.phone, 30);
          const humanHasReplied = history.some((item) => item.role === "assistant" && /^\[Human: [^\]]+]\s*/.test(item.content));

          if (markedHumanTakeover || humanHasReplied) {
            if (!markedHumanTakeover && humanHasReplied) {
              const reason = lead.handoffReason ? `${HUMAN_TAKEOVER_PREFIX} ${lead.handoffReason}` : HUMAN_TAKEOVER_PREFIX;
              lead = await updateLead(message.phone, { handoffReason: reason });
            }
            if (firstEverClientMessage) {
              await notifyDirectorOfNewClient({ lead, firstMessage: message.text, source: "whatsapp", phoneNumberIdOverride: message.phoneNumberId ?? undefined });
            }
            console.info("WhatsApp AI reply skipped for explicit human takeover", { messageId: message.id, assignedTo: lead.assignedTo });
            continue;
          }

          lead = await updateLead(message.phone, { aiPaused: false });
          console.info("Legacy AI referral resumed without waiting for human takeover", { messageId: message.id, assignedTo: lead.assignedTo });
        }

        await sendWhatsAppTypingIndicator(message.id, message.phoneNumberId ?? undefined)
          .then((typing) => console.info("WhatsApp typing indicator processed", { messageId: message.id, skipped: typing.skipped }))
          .catch((error) => console.warn("WhatsApp typing indicator failed; continuing with reply", { messageId: message.id, error }));

        if (isPreparedQuotationRequest(message.text)) {
          const prepared = await getLatestPreparedQuotation(lead.id);
          if (prepared) {
            let reply: string;
            try {
              const delivered = await sendCommercialPdf({ lead, record: prepared, phoneNumberIdOverride: message.phoneNumberId ?? undefined });
              reply = `I've sent your prepared MedMinds quotation ${delivered.documentNumber} above. Please review it and let me know if you would like us to proceed or if you need any clarification.`;
              console.info("Prepared quotation sent to WhatsApp client", { messageId: message.id, quoteId: prepared.id, documentNumber: delivered.documentNumber });
            } catch (error) {
              reply = preparedQuotationFallbackText(prepared);
              console.error("Prepared quotation PDF delivery failed; using text fallback", { messageId: message.id, quoteId: prepared.id, error });
            }

            await addMessage(message.phone, "assistant", reply);
            const sent = await sendWhatsAppTextWithRetry(message.phone, reply, message.phoneNumberId);
            await Promise.all([
              attachOutgoingMessageId({ phone: message.phone, content: reply, messageId: sent.messageId }),
              recordOutgoingMessageAccepted({ messageId: sent.messageId, phone: message.phone })
            ]).catch((error) => console.warn("Unable to link prepared-quotation reply delivery status", { messageId: message.id, error }));
            console.info("Prepared quotation client response sent", { messageId: message.id, quoteId: prepared.id, outboundMessageId: sent.messageId });

            if (firstEverClientMessage) {
              const currentLead = await getOrCreateLead(message.phone, "whatsapp");
              const alerted = await notifyDirectorOfNewClient({ lead: currentLead, firstMessage: message.text, source: "whatsapp", phoneNumberIdOverride: message.phoneNumberId ?? undefined });
              console.info("New client director alert processed", { messageId: message.id, alerted });
            }
            continue;
          }
          console.info("Prepared quotation requested but none is stored for this client", { messageId: message.id, leadId: lead.id });
        }

        const result = await generateWhatsAppReplyWithRecovery(message.phone, message.text);
        console.info("WhatsApp client reply prepared", { messageId: message.id, hasReferral: Boolean(result.referralNotification), queuedDocuments: result.documentIds.length });

        for (const documentId of result.documentIds) {
          const document = await getClientDocumentForLead(documentId, lead.id);
          if (!document) {
            console.warn("Queued client document was no longer assigned", { messageId: message.id, documentId, leadId: lead.id });
            continue;
          }
          try {
            const sentDocument = await sendClientWhatsAppDocument({
              phone: message.phone,
              bytes: document.bytes,
              filename: document.fileName,
              mimeType: document.mimeType,
              phoneNumberIdOverride: message.phoneNumberId ?? undefined
            });
            const documentContent = clientDocumentChatContent({ title: document.title, fileName: document.fileName });
            await addMessage(message.phone, "assistant", documentContent, sentDocument.messageId);
            await Promise.all([
              recordOutgoingMessageAccepted({ messageId: sentDocument.messageId, phone: message.phone }),
              markClientDocumentSent(document.id, lead.id)
            ]);
            console.info("Mary sent assigned client document", { messageId: message.id, documentId: document.id, outboundMessageId: sentDocument.messageId });
          } catch (error) {
            console.error("Mary assigned-document delivery failed", { messageId: message.id, documentId: document.id, error });
          }
        }

        const replyDelayMs = humanReplyDelayMs(Date.now() - processingStartedAt);
        console.info("WhatsApp client reply scheduled", { messageId: message.id, delayMs: replyDelayMs });
        await wait(replyDelayMs);
        const sent = await sendWhatsAppTextWithRetry(message.phone, result.reply, message.phoneNumberId);
        await Promise.all([
          attachOutgoingMessageId({ phone: message.phone, content: result.reply, messageId: sent.messageId }),
          recordOutgoingMessageAccepted({ messageId: sent.messageId, phone: message.phone })
        ]).catch((error) => console.warn("Unable to link AI reply delivery status", { messageId: message.id, error }));
        console.info("WhatsApp client reply sent", { messageId: message.id, outboundMessageId: sent.messageId });

        if (firstEverClientMessage) {
          const currentLead = await getOrCreateLead(message.phone, "whatsapp");
          const alerted = await notifyDirectorOfNewClient({ lead: currentLead, firstMessage: message.text, source: "whatsapp", phoneNumberIdOverride: message.phoneNumberId ?? undefined });
          console.info("New client director alert processed", { messageId: message.id, alerted });
        }

        if (result.referralNotification) {
          try {
            await sendWhatsAppText(result.referralNotification.phone, result.referralNotification.body, message.phoneNumberId ?? undefined);
            console.info("WhatsApp referral notification sent", { messageId: message.id, recipient: result.referralNotification.recipientName });
          } catch (error) {
            console.error("WhatsApp referral notification failed", { messageId: message.id, recipient: result.referralNotification.recipientName, error });
          }
        }
      } catch (error) {
        console.error("WhatsApp message processing failed after recovery", { messageId: message.id, phoneSuffix: message.phone.slice(-4), error });
      }
    }
  });

  return NextResponse.json({ received: true, messages: messages.length, deliveryReceipts: deliveryReceipts.length });
}
