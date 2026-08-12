import { sendTeamNotification } from "@/lib/team-notifications";
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
  try {
    const results = await sendTeamNotification({
      kind: "new_client",
      body: buildNewClientAlert(input),
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
