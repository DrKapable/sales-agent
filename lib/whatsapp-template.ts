import { sanitizeWhatsAppApiError } from "@/lib/whatsapp";

export async function sendWhatsAppFollowUpTemplate(phone: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  const templateName = process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME;
  const languageCode = process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE || "en_US";

  if (!token || !phoneNumberId || !version || !templateName) throw new Error("WhatsApp follow-up template is not configured.");
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phoneNumberId)) throw new Error("Invalid WhatsApp Graph configuration.");

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "template",
      template: { name: templateName, language: { code: languageCode } }
    })
  });

  const rawBody = await response.text();
  if (!response.ok) throw new Error(`WhatsApp template API returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(rawBody))}`);
  const payload = JSON.parse(rawBody) as { messages?: Array<{ id?: string }> };
  const messageId = payload.messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp accepted the follow-up template without returning a message ID.");
  return { messageId };
}
