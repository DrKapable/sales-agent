import type { Lead } from "@/lib/types";

export type ReferralType = "payment" | "discount" | "general";

export const referralRecipients = {
  mustafa: { name: "Dr. Mustafa Juma Phiri", phone: "260977259132" },
  kanyembo: { name: "Dr Kanyembo Ng'andwe", phone: "260974634555" }
} as const;

export function recipientForReferral(type: ReferralType) {
  return type === "payment" || type === "discount"
    ? referralRecipients.mustafa
    : referralRecipients.kanyembo;
}

export function buildReferralMessage(input: {
  recipientName: string;
  lead: Lead;
  reason: string;
  summary: string;
}) {
  const { lead } = input;
  const contact = lead.phone.startsWith("+") ? lead.phone : `+${lead.phone}`;
  return [
    "New MedMinds client referral",
    `Assigned to: ${input.recipientName}`,
    `Client name: ${lead.name || "Not provided"}`,
    `Client contact: ${contact}`,
    `Service: ${lead.serviceInterest || lead.packageName || "Not established"}`,
    `Programme: ${lead.programme || "Not provided"}`,
    `Institution: ${lead.institution || "Not provided"}`,
    `Deadline: ${lead.deadline || "Not provided"}`,
    `Referral reason: ${input.reason}`,
    `Summary: ${input.summary}`
  ].join("\n").replaceAll("—", ",");
}

