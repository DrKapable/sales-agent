import { after, NextRequest, NextResponse } from "next/server";
import { clientDocumentChatContent, getClientDocumentForLead, markClientDocumentSent } from "@/lib/client-documents";
import { sendClientWhatsAppDocument } from "@/lib/client-document-whatsapp";
import { addMessage, getConversation, getOrCreateLead, updateLead } from "@/lib/store";
import { humanReplyDelayMs, wait } from "@/lib/timing";
import { sendTeamCopies } from "@/lib/team-notifications";
import { generateWhatsAppReplyWithRecovery, sendWhatsAppTextWithRetry } from "@/lib/whatsapp-recovery";
import { parseDeliveryReceipts, parseIncomingMessages, sendWhatsAppTypingIndicator, verifyWhatsAppSignature } from "@/lib/whatsapp";
import { notifyDirectorOfNewClient } from "@/lib/new-client-alert";
import { sendCommercialPdf } from "@/lib/commercial-document";
import { getLatestPreparedQuotation, isPreparedQuotationRequest, preparedQuotationFallbackText } from "@/lib/prepared-quotation";
import { rememberWhatsAppSender } from "@/lib/whatsapp-sender-context";
import { applyQuoteDeliveryReceipt } from "@/lib/quotation-delivery";
import { applyMessageDeliveryReceipt, recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { attachOutgoingMessageId } from "@/lib/outgoing-message-link";
import { rewriteLatestUnsentAssistantMessage } from "@/lib/outgoing-message-rewrite";
import { buildAttachmentReviewNotification, classifyIncomingAttachmentForReview } from "@/lib/incoming-attachment-review";
import { forwardAttachmentToReviewers } from "@/lib/team-attachment-forwarding";
import { referralRecipients } from "@/lib/referrals";

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

        const previousHistory = await getConversation(message.phone, 12);
        const firstEverClientMessage = previousHistory.length === 0;
        const isNew = await addMessage(message.phone, "user", message.text, message.id);
        if (!isNew) continue;

        let lead = message.name
          ? await updateLead(message.phone, { name: message.name })
          : await getOrCreateLead(message.phone, "whatsapp");

        const attachmentReview = classifyIncomingAttachmentForReview({
          content: message.text,
          history: previousHistory,
          lead
        });

        if (attachmentReview) {
          await sendWhatsAppTypingIndicator(message.id, message.phoneNumberId ?? undefined)
            .catch((error) => console.warn("WhatsApp typing indicator failed for attachment acknowledgement", { messageId: message.id, error }));

          const handoffReason = `${HUMAN_TAKEOVER_PREFIX} ${attachmentReview.handoffReason}`;
          lead = await updateLead(message.phone, {
            status: attachmentReview.status,
            priority: "HOT",
            aiPaused: true,
            assignedTo: attachmentReview.assignedTo,
            handoffReason
          });

          await addMessage(message.phone, "assistant", attachmentReview.acknowledgement);
          const acknowledgementSent = await sendWhatsAppTextWithRetry(message.phone, attachmentReview.acknowledgement, message.phoneNumberId);
          await Promise.all([
            attachOutgoingMessageId({ phone: message.phone, content: attachmentReview.acknowledgement, messageId: acknowledgementSent.messageId }),
            recordOutgoingMessageAccepted({ messageId: acknowledgementSent.messageId, phone: message.phone })
          ]).catch((error) => console.warn("Unable to link attachment acknowledgement delivery", { messageId: message.id, error }));

          const primary = attachmentReview.kind === "payment_proof" ? referralRecipients.mustafa : referralRecipients.kanyembo;
          const secondary = attachmentReview.kind === "payment_proof" ? referralRecipients.kanyembo : referralRecipients.mustafa;
          const notificationBody = buildAttachmentReviewNotification({ lead, review: attachmentReview });
          const reviewerCaption = attachmentReview.kind === "payment_proof"
            ? `Payment proof from ${lead.name || lead.phone}. Verify independently before activation.`
            : `Client attachment from ${lead.name || lead.phone}. Human review required.`;

          try {
            await sendTeamCopies({
              heading: attachmentReview.kind === "payment_proof" ? "Payment proof received" : "Client attachment review",
              body: notificationBody,
              primary,
              cc: [secondary],
              includeDefaultCc: false,
              phoneNumberIdOverride: message.phoneNumberId ?? undefined
            });
          } catch (error) {
            console.error("Attachment human-review notification failed", { messageId: message.id, reviewKind: attachmentReview.kind, error });
          }

          try {
            const forwarded = await forwardAttachmentToReviewers({
              attachment: attachmentReview.attachment,
              recipients: [primary, secondary],
              caption: reviewerCaption,
              phoneNumberIdOverride: message.phoneNumberId ?? undefined
            });
            console.info("Client attachment forwarded to human reviewers", {
              messageId: message.id,
              reviewKind: attachmentReview.kind,
              sent: forwarded.filter((result) => result.status === "fulfilled" && result.value.sent).length
            });
          } catch (error) {
            console.error("Client attachment media forwarding failed", { messageId: message.id, reviewKind: attachmentReview.kind, error });
          }

          if (firstEverClientMessage) {
            await notifyDirectorOfNewClient({ lead, firstMessage: message.text, source: "whatsapp", phoneNumberIdOverride: message.phoneNumberId ?? undefined })
              .catch((error) => console.error("New attachment client director alert failed", { messageId: message.id, error }));
          }

          console.info("Attachment routed to human review; normal AI reply skipped", { messageId: message.id, reviewKind: attachmentReview.kind, assignedTo: lead.assignedTo });
          continue;
        }

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

        let deliveredDocuments = 0;
        let failedDocuments = 0;
        for (const documentId of result.documentIds) {
          const document = await getClientDocumentForLead(documentId, lead.id);
          if (!document) {
            failedDocuments += 1;
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
              markClientDocumentSent(document.id, lead.id, "Mary Kaunda")
            ]);
            deliveredDocuments += 1;
            console.info("Mary sent assigned client document", { messageId: message.id, documentId: document.id, outboundMessageId: sentDocument.messageId });
          } catch (error) {
            failedDocuments += 1;
            console.error("Mary assigned-document delivery failed", { messageId: message.id, documentId: document.id, error });
          }
        }

        let reply = result.reply;
        if (result.documentIds.length > 0 && deliveredDocuments === 0) {
          reply = "I couldn't attach the assigned document just now. I have kept your request here so it can be retried. You can also ask me to try sending it again.";
          const rewritten = await rewriteLatestUnsentAssistantMessage({ phone: message.phone, from: result.reply, to: reply }).catch(() => false);
          if (!rewritten) await addMessage(message.phone, "assistant", reply).catch(() => undefined);
          await updateLead(message.phone, { status: "FOLLOW-UP REQUIRED", handoffReason: "Assigned client document failed to send through WhatsApp." }).catch(() => undefined);
        } else if (failedDocuments > 0) {
          reply = "I've sent the available document. One additional attachment could not be sent just now. You can ask me to try that attachment again.";
          const rewritten = await rewriteLatestUnsentAssistantMessage({ phone: message.phone, from: result.reply, to: reply }).catch(() => false);
          if (!rewritten) await addMessage(message.phone, "assistant", reply).catch(() => undefined);
        }

        const replyDelayMs = humanReplyDelayMs(Date.now() - processingStartedAt);
        console.info("WhatsApp client reply scheduled", { messageId: message.id, delayMs: replyDelayMs, deliveredDocuments, failedDocuments });
        await wait(replyDelayMs);
        const sent = await sendWhatsAppTextWithRetry(message.phone, reply, message.phoneNumberId);
        await Promise.all([
          attachOutgoingMessageId({ phone: message.phone, content: reply, messageId: sent.messageId }),
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
            const copies = await sendTeamCopies({
              heading: "Client referral",
              body: result.referralNotification.body,
              primary: {
                name: result.referralNotification.recipientName,
                phone: result.referralNotification.phone
              },
              phoneNumberIdOverride: message.phoneNumberId ?? undefined
            });
            console.info("WhatsApp referral notification sent", {
              messageId: message.id,
              recipient: result.referralNotification.recipientName,
              copies: copies.filter((copy) => copy.status === "fulfilled" && copy.value.sent).length
            });
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
