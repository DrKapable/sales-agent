import { referralRecipients } from "@/lib/referrals";
import { getApprovedMetaTemplateInventory, sendApprovedMetaTemplate, type MetaTemplate } from "@/lib/meta-templates";
import { sendWhatsAppText } from "@/lib/whatsapp";
import type { Lead } from "@/lib/types";

export type TeamNotificationKind = "new_client" | "conversation_closed";
export type TeamCopyRecipient = { name: string; phone: string | null };

type CopyLabel = "PRIMARY" | "CC";

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
    specialists.push(referralRecipients.monica);
  }
  if (/legal|dispute|conflict|contract|agreement/.test(context)) {
    specialists.push(referralRecipients.chisha);
  }
  if (/customer support|complaint|review|feedback|support issue/.test(context)) {
    specialists.push(referralRecipients.zabibu);
  }
  if (/marketing|advert|promotion|campaign|social media/.test(context)) {
    specialists.push(referralRecipients.conrad);
  }
  if (/operations|project delivery|implementation|fulfilment|fulfillment/.test(context)) {
    specialists.push(referralRecipients.monica);
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
  return recipients;
}

function variableCount(text = "") {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function referralTemplateScore(template: MetaTemplate) {
  const text = `${template.name} ${template.components.map((item) => item.text || "").join(" ")}`.toLowerCase();
  let score = 0;
  if (/referral|refer|handoff|hand[_ -]?off/.test(text)) score += 120;
  if (/team|assigned|assignment|client alert|lead alert/.test(text)) score += 70;
  if (/medminds|mary/.test(text)) score += 15;
  return score;
}

function referralTemplateUsable(template: MetaTemplate) {
  for (const component of template.components || []) {
    if (component.type === "HEADER" && component.format && component.format !== "TEXT") return false;
    if (!["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(component.type)) return false;
    if (component.type === "BUTTONS" && /\{\{\d+\}\}/.test(JSON.stringify(component))) return false;
  }
  const header = template.components.find((item) => item.type === "HEADER");
  const body = template.components.find((item) => item.type === "BODY");
  return variableCount(header?.text) <= 4 && variableCount(body?.text) <= 4;
}

function chooseReferralTemplate(templates: MetaTemplate[]) {
  const ranked = templates
    .filter(referralTemplateUsable)
    .map((template) => ({ template, score: referralTemplateScore(template) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name));
  return ranked[0]?.template || null;
}

function referralTemplateComponents(template: MetaTemplate, input: {
  recipient: TeamCopyRecipient & { copyLabel: CopyLabel };
  lead?: Lead | null;
  heading: string;
  body: string;
}) {
  const lead = input.lead;
  const clientName = lead?.name || "MedMinds client";
  const service = lead?.serviceInterest || lead?.packageName || input.heading;
  const clientPhone = lead?.phone ? (lead.phone.startsWith("+") ? lead.phone : `+${lead.phone}`) : "See admin dashboard";
  const values = [input.recipient.name, clientName, service, clientPhone];
  const components: Array<{ type: "header" | "body"; parameters: Array<{ type: "text"; text: string }> }> = [];
  const header = template.components.find((item) => item.type === "HEADER");
  const body = template.components.find((item) => item.type === "BODY");
  const headerCount = variableCount(header?.text);
  const bodyCount = variableCount(body?.text);
  if (headerCount) components.push({ type: "header", parameters: values.slice(0, headerCount).map((text) => ({ type: "text", text })) });
  if (bodyCount) components.push({ type: "body", parameters: values.slice(0, bodyCount).map((text) => ({ type: "text", text })) });
  return components;
}

async function sendReferralTemplateCopies(input: {
  heading: string;
  body: string;
  primary: TeamCopyRecipient;
  cc: TeamCopyRecipient[];
  lead?: Lead | null;
}) {
  const inventory = await getApprovedMetaTemplateInventory();
  const template = chooseReferralTemplate(inventory.templates);
  if (!template) return null;

  const recipients = buildRecipients(input.primary, input.cc, false);
  const results = await Promise.allSettled(recipients.map(async (recipient) => {
    if (!recipient.phone) return { recipient: recipient.name, sent: false, copyLabel: recipient.copyLabel, transport: "META_TEMPLATE" };
    const sent = await sendApprovedMetaTemplate({
      phone: recipient.phone,
      name: template.name,
      language: template.language,
      components: referralTemplateComponents(template, { ...input, recipient })
    });
    return {
      recipient: recipient.name,
      sent: true,
      copyLabel: recipient.copyLabel,
      transport: "META_TEMPLATE",
      template: template.name,
      messageId: sent.messageId
    };
  }));

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("Referral Meta template send failed", {
        heading: input.heading,
        recipient: recipients[index]?.name,
        copyLabel: recipients[index]?.copyLabel,
        template: template.name,
        error: result.reason
      });
    }
  });
  return results;
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
    input.cc || [],
    input.includeDefaultCc !== false
  );
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

    try {
      const templateResults = await sendReferralTemplateCopies({
        heading: input.heading,
        body: input.body,
        primary: relevantPrimary,
        cc,
        lead: input.lead
      });
      if (templateResults) return templateResults;
      console.warn("No compatible approved referral Meta template found; falling back to session text notification.", { heading: input.heading });
    } catch (error) {
      console.error("Referral Meta template dispatch failed; falling back to text notification.", { heading: input.heading, error });
    }

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
