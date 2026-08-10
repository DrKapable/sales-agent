import { gateway, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt";
import { addMessage, getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";
import { buildReferralMessage, recipientForReferral } from "@/lib/referrals";
import { leadStatuses, type LeadPatch } from "@/lib/types";

export type SalesAgentResult = {
  reply: string;
  referralNotification: { phone: string; recipientName: string; body: string } | null;
};

export async function replyToClient(phone: string, text: string, source: "whatsapp" | "simulator"): Promise<SalesAgentResult> {
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
    description: "Refer a client only when human help is genuinely required. If the client explicitly asks for a named MedMinds person, preserve that name in the reason or summary so the request can be routed correctly.",
    inputSchema: z.object({
      referralType: z.enum(["payment", "discount", "general"]),
      reason: z.string().min(3).max(500),
      summary: z.string().min(10).max(900).describe("A concise factual summary of the client's request and relevant conversation details.")
    }),
    execute: async ({ referralType, reason, summary }) => {
      const referralText = `${reason} ${summary}`;
      const specificallyAskedForMustafa = /\b(dr\.?\s*)?mustafa\b|\bjuma\s+phiri\b/i.test(referralText);
      const recipient = specificallyAskedForMustafa ? recipientForReferral("payment") : recipientForReferral(referralType);
      const savedLead = await updateLead(phone, { status: "HUMAN ASSISTANCE REQUIRED", handoffReason: reason, aiPaused: true, assignedTo: recipient.name });
      const canNotifyTeam = source === "whatsapp" || /^\d{8,15}$/.test(phone);
      if (canNotifyTeam) {
        referralNotification = {
          phone: recipient.phone,
          recipientName: recipient.name,
          body: buildReferralMessage({ recipientName: recipient.name, lead: savedLead, reason, summary })
        };
      }
      return {
        queued: true,
        assignedTo: recipient.name,
        notificationQueued: canNotifyTeam,
        instruction: `Tell the client the referral has been recorded for ${recipient.name}, who will assist them.`
      };
    }
  });

  const agent = new ToolLoopAgent({
    model: gateway(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
    instructions: `${SALES_AGENT_PROMPT}\n\nCurrent lead record: ${JSON.stringify(lead)}. Tool output is authoritative for offers and prices.`,
    tools: { getApprovedOffers: approvedOffersTool, updateLead: updateLeadTool, requestHumanAssistance: handoffTool }
  });

  const latestStored = history.at(-1)?.role === "user" && history.at(-1)?.content === text;
  const transcript = [...history, ...(latestStored ? [] : [{ role: "user" as const, content: text }])]
    .map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`).join("\n");
  const result = await agent.generate({ prompt: `Conversation including the client's latest message:\n${transcript}\n\nReply only with the WhatsApp message to send.` });
  const reply = (result.text.trim() || "I'll refer this to a member of the MedMinds team so they can assist you properly.").replaceAll("—", ",");
  await addMessage(phone, "assistant", reply);
  return { reply, referralNotification: referralNotification as SalesAgentResult["referralNotification"] };
}
