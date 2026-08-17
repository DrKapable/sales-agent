import { referralRecipients } from "@/lib/referrals";
import { sendWhatsAppText } from "@/lib/whatsapp";

export type TeamNotificationKind = "new_client" | "conversation_closed";
export type TeamCopyRecipient = { name: string; phone: string | null };

type CopyLabel = "PRIMARY" | "CC";

const mandatoryCcRecipients: TeamCopyRecipient[] = [
  referralRecipients.mustafa,
  referralRecipients.conrad,
  referralRecipients.zabibu
];

function recipientKey(recipient: TeamCopyRecipient) {
  return recipient.phone?.replace(/\D/g, "") || recipient.name.trim().toLowerCase();
}

function buildRecipients(primary: TeamCopyRecipient, extraCc: TeamCopyRecipient[] = []) {
  const seen = new Set<string>();
  const recipients: Array<TeamCopyRecipient & { copyLabel: CopyLabel }> = [];
  const add = (recipient: TeamCopyRecipient, copyLabel: CopyLabel) => {
    const key = recipientKey(recipient);
    if (!key || seen.has(key)) return;
    seen.add(key);
    recipients.push({ ...recipient, copyLabel });
  };

  add(primary, "PRIMARY");
  [...extraCc, ...mandatoryCcRecipients].forEach((recipient) => add(recipient, "CC"));
  return recipients;
}

export async function sendTeamCopies(input: {
  heading: string;
  body: string;
  primary: TeamCopyRecipient;
  cc?: TeamCopyRecipient[];
  phoneNumberIdOverride?: string;
}) {
  const recipients = buildRecipients(input.primary, input.cc || []);
  const results = await Promise.allSettled(recipients.map(async (recipient) => {
    if (!recipient.phone) return { recipient: recipient.name, sent: false, copyLabel: recipient.copyLabel };
    const message = [
      `${input.heading} (${recipient.copyLabel})`,
      `For: ${recipient.name}`,
      "",
      input.body
    ].join("\n");
    await sendWhatsAppText(recipient.phone, message, input.phoneNumberIdOverride);
    return { recipient: recipient.name, sent: true, copyLabel: recipient.copyLabel };
  }));

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("Team WhatsApp notification failed", {
        heading: input.heading,
        recipient: recipients[index]?.name,
        copyLabel: recipients[index]?.copyLabel,
        error: result.reason
      });
    }
  });

  return results;
}

export async function sendTeamNotification(input: {
  kind: TeamNotificationKind;
  body: string;
  phoneNumberIdOverride?: string;
}) {
  const heading = input.kind === "new_client" ? "New client alert" : "Conversation closure summary";
  return sendTeamCopies({
    heading,
    body: input.body,
    primary: referralRecipients.kanyembo,
    phoneNumberIdOverride: input.phoneNumberIdOverride
  });
}
