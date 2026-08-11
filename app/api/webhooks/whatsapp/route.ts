import { after, NextRequest, NextResponse } from "next/server";
import { addMessage, getConversation, getOrCreateLead, updateLead } from "@/lib/store";
import { humanReplyDelayMs, wait } from "@/lib/timing";
import { generateWhatsAppReplyWithRecovery, sendWhatsAppTextWithRetry } from "@/lib/whatsapp-recovery";
import { parseIncomingMessages, sendWhatsAppText, verifyWhatsAppSignature } from "@/lib/whatsapp";

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

  after(async () => {
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
            console.info("WhatsApp AI reply skipped for explicit human takeover", { messageId: message.id, assignedTo: lead.assignedTo });
            continue;
          }

          lead = await updateLead(message.phone, { aiPaused: false });
          console.info("Legacy AI referral resumed without waiting for human takeover", { messageId: message.id, assignedTo: lead.assignedTo });
        }

        const result = await generateWhatsAppReplyWithRecovery(message.phone, message.text);
        console.info("WhatsApp client reply prepared", { messageId: message.id, hasReferral: Boolean(result.referralNotification) });

        const replyDelayMs = humanReplyDelayMs(Date.now() - processingStartedAt);
        console.info("WhatsApp client reply scheduled", { messageId: message.id, delayMs: replyDelayMs });
        await wait(replyDelayMs);
        await sendWhatsAppTextWithRetry(message.phone, result.reply, message.phoneNumberId);
        console.info("WhatsApp client reply sent", { messageId: message.id });

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

  return NextResponse.json({ received: true });
}
