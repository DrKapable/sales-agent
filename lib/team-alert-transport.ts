import { getConversation } from "@/lib/store";
import { getApprovedMetaTemplateInventory, sendApprovedMetaTemplate } from "@/lib/meta-templates";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { sanitizeWhatsAppApiError, sendWhatsAppText } from "@/lib/whatsapp";

export const STAFF_NOTIFICATION_TEMPLATE = "medminds_staff_notification_v1";
const LANGUAGE = "en_US";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function staffSessionOpen(phone: string, now = Date.now()) {
  const history = await getConversation(phone, 100);
  const latestInbound = [...history].reverse().find((message) => message.role === "user");
  if (!latestInbound) return false;
  const age = now - new Date(latestInbound.createdAt).getTime();
  return age >= 0 && age < WINDOW_MS;
}

export async function sendStaffAlert(input: { phone: string; name: string; heading: string; body: string; phoneNumberIdOverride?: string }) {
  const messageIds: string[] = [];
  if (await staffSessionOpen(input.phone)) {
    const sent = await sendWhatsAppText(input.phone, `${input.heading}\nFor: ${input.name}\n\n${input.body}`, input.phoneNumberIdOverride);
    messageIds.push(sent.messageId);
  } else {
    const inventory = await getApprovedMetaTemplateInventory();
    const template = inventory.templates.find((item) => item.name === STAFF_NOTIFICATION_TEMPLATE && item.language === LANGUAGE);
    if (!template) throw new Error("Staff notification template requires Meta approval before alerts can be sent outside the 24-hour session.");
    // Meta parameters cannot contain line breaks. Split lengthy briefs so every detail is retained.
    const body = input.body.replace(/\s+/g, " ").trim();
    const chunks = body.match(/[\s\S]{1,900}/g) || ["See the MedMinds staff dashboard."];
    for (let index = 0; index < chunks.length; index += 1) {
      const sent = await sendApprovedMetaTemplate({
        phone: input.phone, name: template.name, language: template.language,
        components: [{ type: "body", parameters: [
          { type: "text", text: input.name },
          { type: "text", text: `${input.heading}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}` },
          { type: "text", text: chunks[index] }
        ] }]
      });
      messageIds.push(sent.messageId);
    }
  }
  await Promise.all(messageIds.map((messageId) => recordOutgoingMessageAccepted({ messageId, phone: input.phone }).catch(() => undefined)));
  return { messageId: messageIds[0], messageIds };
}

export async function staffTemplateStatus() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  const businessId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_WABA_ID;
  if (!token || !version || !businessId) throw new Error("Staff notification template management is not configured.");
  const url = new URL(`https://graph.facebook.com/${version}/${businessId}/message_templates`);
  url.searchParams.set("name", STAFF_NOTIFICATION_TEMPLATE);
  url.searchParams.set("fields", "name,status,language,rejected_reason");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000), cache: "no-store" });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Template status returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(raw))}`);
  const templates = (JSON.parse(raw) as { data?: Array<{ name: string; status: string; language: string; rejected_reason?: string }> }).data || [];
  return templates.find((item) => item.name === STAFF_NOTIFICATION_TEMPLATE && item.language === LANGUAGE) || null;
}

export async function ensureStaffNotificationTemplate() {
  const existing = await staffTemplateStatus();
  if (existing) return existing;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  const businessId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_WABA_ID;
  const response = await fetch(`https://graph.facebook.com/${version}/${businessId}/message_templates`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      name: STAFF_NOTIFICATION_TEMPLATE, language: LANGUAGE, category: "UTILITY",
      components: [{ type: "BODY", text: "MedMinds staff notification\nFor: {{1}}\nUpdate: {{2}}\nDetails: {{3}}\nPlease review this operational update in the MedMinds staff dashboard. You receive this because you are a designated staff contact.",
        example: { body_text: [["Dr. Mustafa Juma Phiri", "Daily management summary", "3 new clients; 2 hot leads; 1 payment awaiting verification."]] } }]
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Template submission returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(raw))}`);
  const result = JSON.parse(raw) as { id?: string; status?: string; category?: string };
  return { name: STAFF_NOTIFICATION_TEMPLATE, language: LANGUAGE, status: result.status || "PENDING", id: result.id };
}
