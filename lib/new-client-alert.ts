import { attachmentDisplayName, parseClientAttachmentChatContent } from "@/lib/client-attachment-content";
import { sendTeamNotification } from "@/lib/team-notifications";
import type { Lead } from "@/lib/types";

export function buildNewClientAlert(input: {
  lead: Lead;
  firstMessage: string;
  source: "whatsapp" | "website";
}) {
  const { lead } = input;
  const contact = lead.phone.startsWith("+") ? lead.phone : `+${lead.phone}`;
  const attachment = parseClientAttachmentChatContent(input.firstMessage);
  const firstMessage = attachment
    ? `Client sent ${attachment.kind}: ${attachmentDisplayName(attachment)}${attachment.caption ? `, ${attachment.caption}` : ""}`
    : input.firstMessage.slice(0, 700);
  return [
    "New MedMinds client",
    `Name: ${lead.name || "Not provided"}`,
    `WhatsApp: ${contact}`,
    `Source: ${input.source === "website" ? "Website chat" : "WhatsApp"}`,
    `Service: ${lead.serviceInterest || lead.packageName || "Not established yet"}`,
    `First message: ${firstMessage.slice(0, 700)}`
  ].join("\n").replaceAll("—", ",");
}

export async function notifyDirectorOfNewClient(input: {
  lead: Lead;
  firstMessage: string;
  source: "whatsapp" | "website";
  phoneNumberIdOverride?: string;
}) {
  const attachment = parseClientAttachmentChatContent(input.firstMessage);
  if (attachment?.kind === "document") {
    console.info("General new-client alert skipped because document referral already notified the sales pipeline team", { phoneSuffix: input.lead.phone.slice(-4) });
    return true;
  }

  try {
    const results = await sendTeamNotification({
      kind: "new_client",
      body: buildNewClientAlert(input),
      lead: input.lead,
      phoneNumberIdOverride: input.phoneNumberIdOverride
    });
    return results.some((result) => result.status === "fulfilled" && result.value.sent);
  } catch (error) {
    console.error("New client team alert failed", {
      source: input.source,
      phoneSuffix: input.lead.phone.slice(-4),
      error
    });
    return false;
  }
}
