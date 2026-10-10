import { referralRecipients } from "@/lib/referrals";
import { sendStaffAlert } from "@/lib/team-alert-transport";
import { staffAlertKind } from "@/lib/team-alert-templates";
import type { Lead } from "@/lib/types";

export type TeamNotificationKind = "new_client" | "conversation_closed";
export type TeamCopyRecipient = { name: string; phone: string | null };

type CopyLabel = "PRIMARY" | "CC";

export const staffAlertRecipients: TeamCopyRecipient[] = [
  referralRecipients.mustafa,
  referralRecipients.kanyembo,
  referralRecipients.zabibu,
  referralRecipients.conrad
];

const defaultCcRecipients: TeamCopyRecipient[] = [
  referralRecipients.mustafa,
  referralRecipients.conrad,
  referralRecipients.zabibu
];

const pipelineCoreRecipients: TeamCopyRecipient[] = [
  referralRecipients.kanyembo,
  referralRecipients.mustafa
];

function recipientKey(recipient: TeamCopyRecipient) {
  return recipient.phone?.replace(/\D/g, "") || recipient.name.trim().toLowerCase();
}

function uniqueRecipients(recipients: TeamCopyRecipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = recipientKey(recipient);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function specialistsForLead(lead?: Lead | null): TeamCopyRecipient[] {
  if (!lead) return [];

  const context = [lead.serviceInterest, lead.packageName, lead.handoffReason]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const specialists: TeamCopyRecipient[] = [];

  if (/research|proposal|dissertation|thesis|data analysis|statistical|publication|methodology/.test(context)) {
    specialists.push(referralRecipients.mustafa);
  }
  if (/legal|dispute|conflict|contract|agreement/.test(context)) {
    specialists.push(referralRecipients.mustafa);
  }
  if (/customer support|complaint|review|feedback|support issue/.test(context)) {
    specialists.push(referralRecipients.zabibu);
  }
  if (/marketing|advert|promotion|campaign|social media/.test(context)) {
    specialists.push(referralRecipients.conrad);
  }
  if (/operations|project delivery|implementation|fulfilment|fulfillment/.test(context)) {
    specialists.push(referralRecipients.mustafa);
  }

  if (lead.assignedTo) {
    const assigned = Object.values(referralRecipients).find(
      (recipient) => recipient.name.trim().toLowerCase() === lead.assignedTo?.trim().toLowerCase()
    );
    if (assigned) specialists.push(assigned);
  }

  return uniqueRecipients(specialists);
}

function buildRecipients(
  primary: TeamCopyRecipient,
  extraCc: TeamCopyRecipient[] = [],
  includeDefaultCc = true
) {
  const seen = new Set<string>();
  const recipients: Array<TeamCopyRecipient & { copyLabel: CopyLabel }> = [];
  const add = (recipient: TeamCopyRecipient, copyLabel: CopyLabel) => {
    const key = recipientKey(recipient);
    if (!key || seen.has(key)) return;
    seen.add(key);
    recipients.push({ ...recipient, copyLabel });
  };

  add(primary, "PRIMARY");
  const ccRecipients = includeDefaultCc ? [...extraCc, ...defaultCcRecipients] : extraCc;
  ccRecipients.forEach((recipient) => add(recipient, "CC"));
  // Every staff handover and marketing copy must also reach the director.
  add(referralRecipients.mustafa, "CC");
  return recipients;
}

export async function sendTeamCopies(input: {
  heading: string;
  body: string;
  primary: TeamCopyRecipient;
  cc?: TeamCopyRecipient[];
  phoneNumberIdOverride?: string;
  includeDefaultCc?: boolean;
}) {
  const recipients = buildRecipients(
    input.primary,
    [
      ...(input.cc || []),
      ...(staffAlertKind(input.heading) === "staff" ? [] : staffAlertRecipients)
    ],
    input.includeDefaultCc !== false
  );
  const results = await Promise.allSettled(recipients.map(async (recipient) => {
    if (!recipient.phone) return { recipient: recipient.name, sent: false, copyLabel: recipient.copyLabel };
    await sendStaffAlert({ phone: recipient.phone, name: recipient.name, heading: `${input.heading} (${recipient.copyLabel})`, body: input.body, phoneNumberIdOverride: input.phoneNumberIdOverride });
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

export async function sendSalesPipelineCopies(input: {
  heading: string;
  body: string;
  primary?: TeamCopyRecipient;
  cc?: TeamCopyRecipient[];
  lead?: Lead | null;
  phoneNumberIdOverride?: string;
}) {
  const specialists = specialistsForLead(input.lead);
  const requestedPrimary = input.primary || referralRecipients.kanyembo;
  const isReferral = /referral|refer|handoff|hand[_ -]?off/i.test(input.heading);

  if (isReferral) {
    const relevantPrimary = specialists.find((recipient) => recipientKey(recipient) !== recipientKey(referralRecipients.mustafa)) || requestedPrimary;
    const cc = uniqueRecipients([
      ...specialists.filter((recipient) => recipientKey(recipient) !== recipientKey(relevantPrimary)),
      ...(input.cc || []),
      referralRecipients.mustafa
    ]);

    return sendTeamCopies({
      heading: input.heading,
      body: input.body,
      primary: relevantPrimary,
      cc,
      phoneNumberIdOverride: input.phoneNumberIdOverride,
      includeDefaultCc: false
    });
  }

  return sendTeamCopies({
    heading: input.heading,
    body: input.body,
    primary: requestedPrimary,
    cc: uniqueRecipients([
      ...pipelineCoreRecipients,
      ...specialists,
      ...(input.cc || [])
    ]),
    phoneNumberIdOverride: input.phoneNumberIdOverride,
    includeDefaultCc: false
  });
}

export async function sendTeamNotification(input: {
  kind: TeamNotificationKind;
  body: string;
  lead?: Lead | null;
  phoneNumberIdOverride?: string;
}) {
  const heading = input.kind === "new_client" ? "New client alert" : "Conversation closure summary";
  return sendSalesPipelineCopies({
    heading,
    body: input.body,
    lead: input.lead,
    primary: referralRecipients.kanyembo,
    phoneNumberIdOverride: input.phoneNumberIdOverride
  });
}
