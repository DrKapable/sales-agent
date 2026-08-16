import { sanitizeWhatsAppApiError } from "@/lib/whatsapp";

export async function sendNamedWhatsAppTemplate(phone: string, templateName: string, languageCode = "en_US", phoneNumberIdOverride?: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = phoneNumberIdOverride || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION;

  if (!token || !phoneNumberId || !version || !templateName) throw new Error("WhatsApp template is not configured.");
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
  if (!messageId) throw new Error("WhatsApp accepted the template without returning a message ID.");
  return { messageId };
}

export function followUpTemplateConfig(step: number) {
  const names = [
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME_1,
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME_2,
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME_3,
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME_4
  ];
  const languages = [
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE_1,
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE_2,
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE_3,
    process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE_4
  ];
  const index = Math.max(0, Math.min(3, step));
  return {
    name: names[index] || process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME || "",
    language: languages[index] || process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE || "en_US"
  };
}

export async function sendWhatsAppFollowUpTemplate(phone: string, step = 0, phoneNumberIdOverride?: string) {
  const config = followUpTemplateConfig(step);
  if (!config.name) throw new Error("WhatsApp follow-up template is not configured.");
  const sent = await sendNamedWhatsAppTemplate(phone, config.name, config.language, phoneNumberIdOverride);
  return { ...sent, templateName: config.name, languageCode: config.language };
}
