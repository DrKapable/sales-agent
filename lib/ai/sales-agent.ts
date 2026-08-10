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
    description: "Save genuinely new client details or update the sales status. Do not ask again for information already in the lead record. Never mark a lead converted without verified payment confirmation.",
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
    description: "Search active management-approved MedMinds packages, prices, features and payment instructions. Use this before saying a price or service detail is unavailable. Pass ordinary service words such as 'masters research proposal', 'Pa Gym OSCE' or 'quantitative analysis'.",
    inputSchema: z.object({ query: z.string().max(160).optional() }),
    execute: async ({ query }) => {
      const ignored = new Set(["the", "and", "for", "with", "how", "much", "price", "cost", "service", "services", "writing", "level"]);
      const terms = (query ?? "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !ignored.has(term));
      const ranked = (await listOffers(true)).map((offer) => {
        const haystack = `${offer.name} ${offer.slug} ${offer.category} ${offer.description} ${offer.features.join(" ")}`.toLowerCase().replace(/[’']/g, "");
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { offer, score };
      }).filter(({ score }) => !terms.length || score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
      const offers = ranked.map(({ offer }) => offer);
      return offers.length ? offers.map(({ name, category: offerCategory, description, features, priceZmw, rushPriceZmw, paymentInstructions }) => ({ name, category: offerCategory, description, features, standardPriceZmw: priceZmw, rushPriceZmw, paymentInstructions })) : { available: false, instruction: "No direct approved offer matched. Try one broader service word before considering a human referral. Do not guess a price." };
    }
  });

  const handoffTool = tool({
    description: "Refer a client only when a person is genuinely required: explicit human request, custom quotation or null-price service, payment confirmation/refund/dispute, discount request, serious complaint, sensitive judgement, or an unresolved issue after approved-offer search. Do not use this for ordinary greetings, thanks, service questions or pricing questions that approved offer data can answer.",
    inputSchema: z.object({
      referralType: z.enum(["payment", "discount", "general"]),
      reason: z.string().min(3).max(500),
      summary: z.string().min(10).max(900).describe("A concise factual summary of the client's request and relevant conversation details.")
    }),
    execute: async ({ referralType, reason, summary }) => {
      const recipient = recipientForReferral(referralType);
      const savedLead = await updateLead(phone, { status: "HUMAN ASSISTANCE REQUIRED", handoffReason: reason, aiPaused: true, assignedTo: recipient.name });
      if (source === "whatsapp") {
        referralNotification = {
          phone: recipient.phone,
          recipientName: recipient.name,
          body: buildReferralMessage({ recipientName: recipient.name, lead: savedLead, reason, summary })
        };
      }
      return {
        queued: true,
        assignedTo: recipient.name,
        notificationQueued: source === "whatsapp",
        instruction: `Acknowledge the client's specific issue briefly and say ${recipient.name} will pick it up. Mention the referral once and avoid generic waiting language.`
      };
    }
  });

  const agent = new ToolLoopAgent({
    model: gateway(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
    instructions: `${SALES_AGENT_PROMPT}\n\nCurrent lead record: ${JSON.stringify(lead)}. Tool output is authoritative for offers, prices and payment instructions.`,
    tools: { getApprovedOffers: approvedOffersTool, updateLead: updateLeadTool, requestHumanAssistance: handoffTool }
  });

  const latestStored = history.at(-1)?.role === "user" && history.at(-1)?.content === text;
  const transcript = [...history, ...(latestStored ? [] : [{ role: "user" as const, content: text }])]
    .map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`).join("\n");
  const result = await agent.generate({ prompt: `This is one chronological WhatsApp conversation. Continue naturally from the latest client message.\n\n${transcript}\n\nDo not restart the conversation, repeat an earlier canned reply, or refer routine questions to a human. If the latest message is only a nudge such as hey or ?, continue the unresolved question immediately before it. Use approved offer data before saying a price or service detail is unavailable. Reply only with the WhatsApp message to send.` });
  const fallback = referralNotification ? `I've passed that to ${referralNotification.recipientName}. They'll pick it up from here.` : "Sorry, I missed that. Could you send that once more?";
  const reply = (result.text.trim() || fallback).replaceAll("—", ",");
  await addMessage(phone, "assistant", reply);
  return { reply, referralNotification: referralNotification as SalesAgentResult["referralNotification"] };
}
