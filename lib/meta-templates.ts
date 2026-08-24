import { sanitizeWhatsAppApiError } from "@/lib/whatsapp";

export type MetaTemplateComponent = {
  type: string;
  format?: string;
  text?: string;
  example?: { header_text?: string[]; body_text?: string[][] };
};

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  components: MetaTemplateComponent[];
};

const META_SAMPLE_TEMPLATE_NAMES = new Set([
  "hello_world",
  "jaspers_market_image_cta_v1",
  "jaspers_market_media_carousel_v1",
  "jaspers_market_order_confirmation_v1",
  "jaspers_market_plain_text_v1"
]);

function config() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WHATSAPP_WABA_ID;
  if (!token || !version || !phoneNumberId) throw new Error("WhatsApp Cloud API is not configured.");
  if (!businessAccountId) throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID is required to load approved Meta templates.");
  return { token, version, phoneNumberId, businessAccountId };
}

export function isMetaSampleTemplate(name: string) {
  return META_SAMPLE_TEMPLATE_NAMES.has(name.toLowerCase());
}

export async function listApprovedMetaTemplates(): Promise<MetaTemplate[]> {
  const { token, version, businessAccountId } = config();
  const url = new URL(`https://graph.facebook.com/${version}/${businessAccountId}/message_templates`);
  url.searchParams.set("fields", "id,name,language,status,category,components");
  url.searchParams.set("limit", "100");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${token}` } });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Meta template lookup returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(raw))}`);
  const data = JSON.parse(raw) as { data?: MetaTemplate[] };
  return (data.data || []).filter((template) => template.status === "APPROVED").sort((a, b) => a.name.localeCompare(b.name));
}

export async function getApprovedMetaTemplateInventory() {
  const { businessAccountId } = config();
  const approved = await listApprovedMetaTemplates();
  const samples = approved.filter((template) => isMetaSampleTemplate(template.name));
  const production = approved.filter((template) => !isMetaSampleTemplate(template.name));
  return {
    templates: production,
    approvedCount: approved.length,
    sampleCount: samples.length,
    sampleOnly: approved.length > 0 && production.length === 0,
    wabaSuffix: businessAccountId.slice(-6)
  };
}

export async function sendApprovedMetaTemplate(input: {
  phone: string;
  name: string;
  language: string;
  components?: Array<{ type: "header" | "body"; parameters: Array<{ type: "text"; text: string }> }>;
}) {
  const { token, version, phoneNumberId } = config();
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.phone.replace(/\D/g, ""),
      type: "template",
      template: {
        name: input.name,
        language: { code: input.language },
        ...(input.components?.length ? { components: input.components } : {})
      }
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Meta template send returned ${response.status}: ${JSON.stringify(sanitizeWhatsAppApiError(raw))}`);
  const parsed = JSON.parse(raw) as { messages?: Array<{ id?: string }> };
  const messageId = parsed.messages?.[0]?.id;
  if (!messageId) throw new Error("Meta accepted the template without returning a message ID.");
  return { messageId };
}
