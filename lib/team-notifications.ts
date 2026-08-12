import { referralRecipients } from "@/lib/referrals";
import { sendWhatsAppText } from "@/lib/whatsapp";

export type TeamNotificationKind = "new_client" | "conversation_closed";

const notificationRecipients = [
  { ...referralRecipients.kanyembo, copyLabel: "PRIMARY" as const },
  { ...referralRecipients.mustafa, copyLabel: "CC" as const },
  { ...referralRecipients.conrad, copyLabel: "CC" as const },
  { ...referralRecipients.zabibu, copyLabel: "CC" as const }
];

export async function sendTeamNotification(input: {
  kind: TeamNotificationKind;
  body: string;
  phoneNumberIdOverride?: string;
}) {
  const results = await Promise.allSettled(notificationRecipients.map(async (recipient) => {
    if (!recipient.phone) return { recipient: recipient.name, sent: false };
    const heading = input.kind === "new_client" ? "New client alert" : "Conversation closure summary";
    const message = [
      `${heading} (${recipient.copyLabel})`,
      `For: ${recipient.name}`,
      "",
      input.body
    ].join("\n");
    await sendWhatsAppText(recipient.phone, message, input.phoneNumberIdOverride);
    return { recipient: recipient.name, sent: true };
  }));

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("Team WhatsApp notification failed", {
        kind: input.kind,
        recipient: notificationRecipients[index]?.name,
        error: result.reason
      });
    }
  });

  return results;
}
