import { gateway, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt";
import { addMessage, getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";
import { leadStatuses, type LeadPatch } from "@/lib/types";

export async function replyToClient(phone: string, text: string, source: "whatsapp" | "simulator") {
  const lead = await getOrCreateLead(phone, source);
  const history = await getConversation(phone);

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
      return offers.length ? offers.map(({ name, category: offerCategory, description, features, priceZmw, paymentInstructions }) => ({ name, category: offerCategory, description, features, priceZmw, paymentInstructions })) : { available: false, instruction: "No verified active offer matches this request. Do not guess. Arrange human confirmation." };
    }
  });

  const handoffTool = tool({
    description: "Request assistance from a human MedMinds team member for refunds, disputes, complaints, special pricing, custom quotations, sensitive matters, or unavailable verified information.",
    inputSchema: z.object({ reason: z.string().min(3).max(500) }),
    execute: async ({ reason }) => {
      await updateLead(phone, { status: "HUMAN ASSISTANCE REQUIRED", handoffReason: reason });
      return { queued: true, instruction: "Tell the client a MedMinds team member will assist them." };
    }
  });

  const agent = new ToolLoopAgent({
    model: gateway(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
    instructions: `${SALES_AGENT_PROMPT}\n\nCurrent lead record: ${JSON.stringify(lead)}. Tool output is authoritative for offers and prices.`,
    tools: { getApprovedOffers: approvedOffersTool, updateLead: updateLeadTool, requestHumanAssistance: handoffTool }
  });

  const transcript = history.map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`).join("\n");
  const result = await agent.generate({ prompt: `${transcript ? `Conversation so far:\n${transcript}\n\n` : ""}Client's latest message: ${text}\n\nReply only with the WhatsApp message to send.` });
  const reply = result.text.trim() || "I'll refer this to a member of the MedMinds team so they can assist you properly.";
  await addMessage(phone, "assistant", reply);
  return reply;
}

