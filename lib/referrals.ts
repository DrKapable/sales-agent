import type { Lead } from "@/lib/types";

export type ReferralType =
  | "payment"
  | "discount"
  | "research"
  | "operations"
  | "customer_support"
  | "dispute"
  | "legal"
  | "marketing"
  | "administrative"
  | "software"
  | "cybersecurity"
  | "general";

type ReferralRecipient = {
  name: string;
  phone: string | null;
  roles: readonly string[];
  contactProvided?: string;
};

export const referralRecipients: Record<string, ReferralRecipient> = {
  mustafa: { name: "Dr. Mustafa Juma Phiri", phone: "260977259132", roles: ["Management", "Payments", "Discount approvals"] },
  kanyembo: { name: "Dr Kanyembo Ng'andwe", phone: "260974634555", roles: ["General escalation", "Operations support"] },
  chisha: { name: "Chisha", phone: "260970623913", roles: ["Customer support", "Conflict and dispute resolution", "Legal consultant"] },
  conrad: { name: "Conrad Mununkha Phiri", phone: "260979235018", roles: ["Digital marketing", "Marketing team", "Secretary"] },
  madalitso: { name: "Madalitso", phone: "260979104893", roles: ["Operations team", "Research support expert"] },
  kabosha: { name: "Kabosha", phone: "260776037567", roles: ["Computer scientist", "Cybersecurity expert", "Technical support"] },
  zabibu: { name: "Dr Zabibu Nandazi", phone: "260975352801", roles: ["Digital marketing", "Marketing team", "Customer support"] }
};

function namedRecipient(context: string) {
  const text = context.toLowerCase();
  if (/\bmustafa\b|\bjuma phiri\b/.test(text)) return referralRecipients.mustafa;
  if (/\bkanyembo\b|\bng['’]?andwe\b/.test(text)) return referralRecipients.kanyembo;
  if (/\bchisha\b/.test(text)) return referralRecipients.chisha;
  if (/\bconrad\b|\bmununkha\b/.test(text)) return referralRecipients.conrad;
  if (/\bmadalitso\b/.test(text)) return referralRecipients.madalitso;
  if (/\bkabosha\b/.test(text)) return referralRecipients.kabosha;
  if (/\bzabibu\b|\bnandazi\b/.test(text)) return referralRecipients.zabibu;
  return null;
}

export function recipientForReferral(type: ReferralType, context = "") {
  const requestedPerson = namedRecipient(context);
  if (requestedPerson) return requestedPerson;

  switch (type) {
    case "payment":
    case "discount":
      return referralRecipients.mustafa;
    case "research":
    case "operations":
      return referralRecipients.madalitso;
    case "customer_support":
      return referralRecipients.zabibu;
    case "dispute":
    case "legal":
      return referralRecipients.chisha;
    case "marketing":
    case "administrative":
      return referralRecipients.conrad;
    case "software":
    case "cybersecurity":
      return referralRecipients.kabosha;
    default:
      return referralRecipients.kanyembo;
  }
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
