import { buildReferralMessage, referralRecipients } from "@/lib/referrals";
import { addMessage, getConversation, getOrCreateLead, updateLead } from "@/lib/store";
import type { SalesAgentResult } from "@/lib/ai/sales-agent";
import type { Lead } from "@/lib/types";

export const SPECIALIST_HANDOFF_MESSAGE = "Because your project has specific requirements and a clear timeline, I am connecting you directly with a dedicated MedMinds specialist. They will review the details you just shared and message you personally to map out the best approach. You will hear from them shortly from this number: +260974634555.";
export const SPECIALIST_HANDOFF_PREFIX = "[DEDICATED SPECIALIST HANDOFF]";

export async function prepareSpecialistHandoff(input: {
  phone: string;
  source: "whatsapp" | "simulator";
  trigger: "hot" | "complex_custom";
  latestText: string;
  reason?: string;
  summary?: string;
  action?: string;
}): Promise<SalesAgentResult | null> {
  const lead = await getOrCreateLead(input.phone, input.source);
  const history = await getConversation(input.phone, 128);
  // A single handoff per ongoing lead; later coordination remains with Mary.
  if (lead.handoffReason?.startsWith(SPECIALIST_HANDOFF_PREFIX)
    || history.some((message) => message.role === "assistant" && message.content === SPECIALIST_HANDOFF_MESSAGE)) return null;
  const recipient = referralRecipients.kanyembo;
  const reason = input.reason || (input.trigger === "hot"
    ? "Lead is tagged HOT. Priority personal follow-up required."
    : "Complex custom question needs a human specialist's answer.");
  const saved = await updateLead(input.phone, {
    status: "HUMAN ASSISTANCE REQUIRED",
    assignedTo: recipient.name,
    handoffReason: `${SPECIALIST_HANDOFF_PREFIX} ${reason}`,
    aiPaused: false
  });
  const body = buildReferralMessage({
    recipientName: recipient.name, lead: saved, reason,
    summary: input.summary || input.latestText, action: input.action
  });
  return {
    reply: SPECIALIST_HANDOFF_MESSAGE,
    referralNotification: input.source === "whatsapp" || /^\d{8,15}$/.test(input.phone)
      ? { phone: recipient.phone!, recipientName: recipient.name, body, heading: "MedMinds handoff" }
      : null,
    documentIds: []
  };
}

export function shouldHandoffHotLead(lead: Pick<Lead, "priority" | "status" | "aiPaused">) {
  return lead.priority === "HOT" && !lead.aiPaused && !["CONVERTED", "LOST LEAD"].includes(lead.status);
}

export async function maybePrepareHotLeadHandoff(phone: string, latestText: string, source: "whatsapp" | "simulator") {
  const lead = await getOrCreateLead(phone, source);
  if (!shouldHandoffHotLead(lead)) return null;
  const result = await prepareSpecialistHandoff({ phone, source, trigger: "hot", latestText });
  if (result) await addMessage(phone, "assistant", result.reply);
  return result;
}
