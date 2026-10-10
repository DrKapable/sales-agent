import type { Lead } from "@/lib/types";

export type ReferralType =
  | "payment"
  | "discount"
  | "sales"
  | "research"
  | "research_specialist"
  | "operations"
  | "customer_support"
  | "dispute"
  | "legal"
  | "marketing"
  | "administrative"
  | "software"
  | "business_automation"
  | "web_development"
  | "cybersecurity"
  | "general";

type ReferralRecipient = {
  name: string;
  phone: string | null;
  roles: readonly string[];
  contactProvided?: string;
};

export const referralRecipients: Record<string, ReferralRecipient> = {
  mustafa: {
    name: "Dr. Mustafa Juma Phiri",
    phone: "260977259132",
    roles: ["Director", "Research specialist", "Research support", "Software development", "Business automation", "Web development", "Cybersecurity and technical escalation", "Payments", "Discount approvals"]
  },
  kanyembo: {
    name: "Dr Kanyembo Ng'andwe",
    phone: "260974634555",
    roles: ["Sales representative", "Lead conversion", "Marketing team", "Senior sales escalation"]
  },
  conrad: {
    name: "Mr Conrad Mununkha Phiri",
    phone: "260979235018",
    roles: ["Digital marketing", "Marketing team", "Secretary"]
  },
  zabibu: {
    name: "Dr Zabibu Nandazi",
    phone: "260975352801",
    roles: ["Digital marketing", "Marketing team", "Customer support"]
  }
};

function namedRecipient(context: string) {
  const text = context.toLowerCase();
  if (/\bmustafa\b|\bjuma phiri\b|\bdirector\b/.test(text)) return referralRecipients.mustafa;
  if (/\bkanyembo\b|\bng['’]?andwe\b/.test(text)) return referralRecipients.kanyembo;
  if (/\bchisha\b|\bchomba\b|\bcounsel chisha\b/.test(text)) return referralRecipients.mustafa;
  if (/\bconrad\b|\bmununkha\b/.test(text)) return referralRecipients.conrad;
  if (/\bmonica\b/.test(text)) return referralRecipients.mustafa;
  if (/\bzabibu\b|\bnandazi\b/.test(text)) return referralRecipients.zabibu;
  return null;
}

export function recipientForReferral(type: ReferralType, context = "") {
  const requestedPerson = namedRecipient(context);
  if (requestedPerson) return requestedPerson;

  switch (type) {
    case "payment":
    case "discount":
    case "research_specialist":
    case "software":
    case "business_automation":
    case "web_development":
    case "cybersecurity":
      return referralRecipients.mustafa;
    case "sales":
      return referralRecipients.kanyembo;
    case "research":
    case "operations":
      return referralRecipients.mustafa;
    case "customer_support":
      return referralRecipients.zabibu;
    case "dispute":
    case "legal":
      return referralRecipients.mustafa;
    case "marketing":
    case "administrative":
      return referralRecipients.conrad;
    default:
      return referralRecipients.kanyembo;
  }
}

export function buildReferralMessage(input: {
  recipientName: string;
  lead: Lead;
  reason: string;
  summary: string;
  action?: string;
}) {
  const { lead } = input;
  const contact = lead.phone.startsWith("+") ? lead.phone : `+${lead.phone}`;
  const concise = (value: string, limit: number) => {
    const text = value.replace(/\s+/g, " ").trim().replaceAll("—", ",");
    if (text.length <= limit) return text;
    const cut = text.slice(0, limit - 1);
    const boundary = cut.lastIndexOf(" ");
    return `${cut.slice(0, boundary > limit * 0.6 ? boundary : cut.length)}…`;
  };
  const deadline = lead.deadline
    ?.split(/\n|(?<=[.!?])\s+|\s+but\s+/i)[0]
    .replace(/\b(\d{1,2})\s+(st|nd|rd|th)\b/gi, "$1$2")
    .replace(/^(?:the\s+)?(?:assignment|project|work|proposal|dissertation|thesis)\s+(?:is\s+)?due\s+(?:on\s+)?/i, "")
    .trim();
  const defaultAction = /(?:no|not|unavailable|missing|custom).{0,65}(?:price|pricing|quotation|quote)|(?:price|pricing).{0,65}(?:unavailable|not available|not approved)/i.test(`${input.reason} ${input.summary}`)
    ? "Confirm a custom quotation and contact the client."
    : /lead is tagged hot|high need \+ high urgency/i.test(input.reason)
      ? "Contact the client promptly and confirm the best approach."
      : input.reason;
  return [
    `Client: ${concise(lead.name || "Unnamed client", 60)} | ${contact}`,
    `Assigned: ${concise(input.recipientName, 70)}${lead.priority === "HOT" ? " | HOT" : ""}`,
    `Service: ${concise(lead.serviceInterest || lead.packageName || input.summary, 240)}`,
    lead.programme ? `Programme: ${concise(lead.programme, 100)}` : null,
    deadline ? `Due: ${concise(deadline, 80)}` : null,
    `Action: ${concise(input.action || defaultAction, 160)}`
  ].filter(Boolean).join("\n");
}
