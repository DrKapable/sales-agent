import { referralRecipients } from "@/lib/referrals";
import { sendWhatsAppText } from "@/lib/whatsapp";
import type { Lead } from "@/lib/types";

export function buildNewClientAlert(input: {
  lead: Lead;
  firstMessage: string;
  source: "whatsapp" | "website";
}) {
  const { lead } = input;
  const contact = lead.phone.startsWith("+") ? lead.phone : `+${lead.phone}`;
  return [
    "New MedMinds client",
    `Name: ${lead.name || "Not provided"}`,
    `WhatsApp: ${contact}`,
    `Source: ${input.source === "website" ? "Website chat" : "WhatsApp"}`,
    `Service: ${lead.serviceInterest || lead.packageName || "Not established yet"}`,
    `First message: ${input.firstMessage.slice(0, 700)}`
  ].join("\n").replaceAll("—", ",");
}

export async function notifyDirectorOfNewClient(input: {
  lead: Lead;
  firstMessage: string;
  source: "whatsapp" | "website";
  phoneNumberIdOverride?: string;
}) {
  const director = referralRecipients.mustafa;
  if (!director.phone) return false;
  try {
    await sendWhatsAppText(
      director.phone,
      buildNewClientAlert(input),
      input.phoneNumberIdOverride
    );
    return true;
  } catch (error) {
    console.error("New client director alert failed", {
      source: input.source,
      phoneSuffix: input.lead.phone.slice(-4),
      error
    });
    return false;
  }
}
