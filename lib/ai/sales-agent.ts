import { gateway, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt";
import { getAiModel } from "@/lib/env";
import { restoreChat } from "@/lib/chat-lifecycle";
import { addMessage, getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";
import { buildReferralMessage, recipientForReferral } from "@/lib/referrals";
import { leadStatuses, type LeadPatch } from "@/lib/types";

export type SalesAgentResult = {
  reply: string;
  referralNotification: { phone: string; recipientName: string; body: string } | null;
};

export async function replyToClient(phone: string, text: string, source: "whatsapp" | "simulator", modelOverride?: string): Promise<SalesAgentResult> {
  await restoreChat(phone).catch(() => undefined);
  const lead = await getOrCreateLead(phone, source);
  const history = await getConversation(phone);
  let referralNotification: SalesAgentResult["referralNotification"] = null;

  const updateLeadTool = tool({
    description: "Save new client details or update the sales status. Never mark a lead converted without verified payment confirmation.",
    inputSchema: z.object({
      name: z.string().min(1).max(120).optional(),
      email: z.string().email().optional(),
      institution: z.string().min(1).max(180).optional(),
      programme: z.string().min(1).max(180).optional(),
      serviceInterest: z.string().min(1).max(180).optional(),
      deadline: z.string().min(1).max(120).optional(),
      packageName: z.string().min(1).max(180).optional(),
      status: z.enum(leadStatuses).optional()
    }),
    execute: async (patch) => {
      if (patch.status === "CONVERTED") return { saved: false, reason: "Payment confirmation is required before conversion." };
      const saved = await updateLead(phone, patch as LeadPatch);
      return { saved: true, status: saved.status };
    }
  });

  const approvedOffersTool = tool({
    description: "Retrieve currently active, management-approved packages, prices, features, and payment instructions. Use this before quoting any price or promotion.",
    inputSchema: z.object({ category: z.string().max(80).optional() }),
    execute: async ({ category }) => {
      const offers = (await listOffers(true)).filter((offer) => !category || offer.category.toLowerCase().includes(category.toLowerCase()));
      return offers.length ? offers.map(({ name, category: offerCategory, description, features, priceZmw, rushPriceZmw, paymentInstructions }) => ({ name, category: offerCategory, description, features, standardPriceZmw: priceZmw, rushPriceZmw, paymentInstructions })) : { available: false, instruction: "No verified active offer matches this request. Do not guess. Arrange human confirmation." };
    }
  });

  const handoffTool = tool({
    description: "Assign genuine human escalations to the most appropriate MedMinds team member. Use payment/discount for Dr Mustafa; research/operations for Madalitso; routine customer support for Dr Zabibu; dispute/legal for Chisha; marketing/administrative for Conrad; software/cybersecurity for Kabosha; general only when no specialist category fits. Preserve any explicitly requested staff member in the reason or summary.",
    inputSchema: z.object({
      referralType: z.enum(["payment", "discount", "research", "operations", "customer_support", "dispute", "legal", "marketing", "administrative", "software", "cybersecurity", "general"]),
      reason: z.string().min(3).max(500),
      summary: z.string().min(10).max(900).describe("A concise factual summary of the client's request and relevant conversation details.")
    }),
    execute: async ({ referralType, reason, summary }) => {
      const recipient = recipientForReferral(referralType, `${reason} ${summary} ${lead.serviceInterest ?? ""}`);
      const alreadyAssigned = lead.status === "HUMAN ASSISTANCE REQUIRED" && lead.assignedTo === recipient.name;
      const savedLead = await updateLead(phone, { status: "HUMAN ASSISTANCE REQUIRED", handoffReason: reason, aiPaused: false, assignedTo: recipient.name });
      const canNotifyTeam = !alreadyAssigned && Boolean(recipient.phone) && (source === "whatsapp" || /^\d{8,15}$/.test(phone));
      if (canNotifyTeam && recipient.phone) {
        referralNotification = {
          phone: recipient.phone,
          recipientName: recipient.name,
          body: buildReferralMessage({ recipientName: recipient.name, lead: savedLead, reason, summary })
        };
      }
      return {
        queued: !alreadyAssigned,
        assignedTo: recipient.name,
        notificationQueued: canNotifyTeam,
        instruction: alreadyAssigned
          ? `${recipient.name} is already assigned. Do not repeat the referral. Continue helping the client with anything you can answer while they wait.`
          : canNotifyTeam
            ? `${recipient.name} has been assigned and the referral notification is queued. Keep helping the client normally while they wait, unless an administrator explicitly takes over the conversation.`
            : `${recipient.name} is the correct specialist and has been assigned internally. Do not claim a WhatsApp notification was sent. Keep helping the client normally while the admin team sees the assignment.`
      };
    }
  });

  const model = modelOverride || getAiModel();
  const agent = new ToolLoopAgent({
    model: gateway(model),
    instructions: `${SALES_AGENT_PROMPT}\n\nTEAM ROUTING - THESE RULES OVERRIDE ANY EARLIER GENERAL HANDOVER ROUTING\n- Payments, payment confirmation, payment concerns and discount approvals: Dr. Mustafa Juma Phiri.\n- Research support, proposal/dissertation support requiring a person, and operations-related research cases: Madalitso.\n- Routine customer support and ordinary client assistance that genuinely needs a person: Dr Zabibu Nandazi.\n- Complaints involving conflict, disputes, legal questions, contracts, terms or sensitive resolution: Chisha.\n- Marketing, advertising, campaigns, partnerships, promotion and administrative/secretarial matters: Conrad Mununkha Phiri.\n- Software development, websites, automation, technical systems, cybersecurity or security incidents: Kabosha.\n- Use Dr Kanyembo Ng'andwe only for genuine general escalations that do not fit a specialist category.\n- If the client explicitly asks for a named team member, preserve that name in the referral summary so the routing system honours the request.\n- Do not refer ordinary questions just because a specialist exists. Answer from approved information first and escalate only when human action or judgement is actually needed.\n\nHANDOVER CONTINUITY\n- A referral or staff assignment does not end your role in the conversation. Keep responding to new client messages and answer anything you can safely and accurately answer.\n- Do not repeatedly tell the client to wait after a referral. If a human is already assigned, acknowledge that only when relevant and continue helping.\n- Resolve pronouns and short follow-up questions from the recent transcript. If a client asks for \"the link\", \"this\", \"that\" or \"check myself\", infer the service they were discussing instead of asking them to repeat the request.\n- Only an explicit administrator takeover pauses AI replies; the webhook enforces that outside this prompt.\n\nCurrent lead record: ${JSON.stringify(lead)}. Tool output is authoritative for offers and prices.`,
    tools: { getApprovedOffers: approvedOffersTool, updateLead: updateLeadTool, requestHumanAssistance: handoffTool }
  });

  const latestStored = history.at(-1)?.role === "user" && history.at(-1)?.content === text;
  const transcript = [...history, ...(latestStored ? [] : [{ role: "user" as const, content: text }])]
    .map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`).join("\n");
  const result = await agent.generate({ prompt: `Conversation including the client's latest message:\n${transcript}\n\nReply only with the WhatsApp message to send.` });
  const reply = (result.text.trim() || "I’ll make sure a MedMinds team member helps with that.").replaceAll("—", ",");
  await addMessage(phone, "assistant", reply);
  return { reply, referralNotification: referralNotification as SalesAgentResult["referralNotification"] };
}
