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

/**
 * Supports a single currently-approved fallback template plus optional
 * step-specific approved templates. This does not assume those templates exist:
 * WHATSAPP_FOLLOWUP_TEMPLATE_NAME_1 ... _4 can be added after Meta approval.
 */
export function followUpTemplateConfig(step: number) {
  const number = Math.max(1, Math.min(4, step + 1));
  const stepName = process.env[`WHATSAPP_FOLLOWUP_TEMPLATE_NAME_${number}`];
  const stepLanguage = process.env[`WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE_${number}`];
  return {
    name: stepName || process.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME || "",
    language: stepLanguage || process.env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE || "en_US"
  };
}

export async function sendWhatsAppFollowUpTemplate(phone: string, step = 0, phoneNumberIdOverride?: string) {
  const config = followUpTemplateConfig(step);
  if (!config.name) throw new Error("WhatsApp follow-up template is not configured.");
  const sent = await sendNamedWhatsAppTemplate(phone, config.name, config.language, phoneNumberIdOverride);
  return { ...sent, templateName: config.name, languageCode: config.language };
}
