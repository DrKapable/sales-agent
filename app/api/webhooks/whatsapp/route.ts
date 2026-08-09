import { after, NextRequest, NextResponse } from "next/server";
import { replyToClient } from "@/lib/ai/sales-agent";
import { addMessage, updateLead } from "@/lib/store";
import { parseIncomingMessages, sendWhatsAppText, verifyWhatsAppSignature } from "@/lib/whatsapp";

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
      try {
        const isNew = await addMessage(message.phone, "user", message.text, message.id);
        if (!isNew) continue;
        if (message.name) await updateLead(message.phone, { name: message.name });
        const reply = await replyToClient(message.phone, message.text, "whatsapp");
        await sendWhatsAppText(message.phone, reply);
      } catch (error) { console.error("WhatsApp message processing failed", { messageId: message.id, error }); }
    }
  });
  return NextResponse.json({ received: true });
}

