import { gateway, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt";
import { addMessage, getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";
import { buildReferralMessage, recipientForReferral } from "@/lib/referrals";
import { leadStatuses, type LeadPatch, type Offer } from "@/lib/types";

export type SalesAgentResult = {
  reply: string;
  referralNotification: { phone: string; recipientName: string; body: string } | null;
};

const OFFER_SEARCH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "cost", "do", "does", "for", "how", "is", "it", "level", "much", "of", "price", "service", "services", "the", "to", "what", "with", "writing"
]);

function normalizeOfferSearch(value: string) {
  return value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function offerSearchTerms(value: string) {
  return normalizeOfferSearch(value).split(/\s+/).filter((term) => term.length > 1 && !OFFER_SEARCH_STOP_WORDS.has(term));
}

function rankApprovedOffers(offers: Offer[], query?: string) {
  if (!query?.trim()) return offers;
  const normalizedQuery = normalizeOfferSearch(query);
  const terms = offerSearchTerms(query);
  if (!terms.length) return offers;

  return offers
    .map((offer) => {
      const name = normalizeOfferSearch(offer.name);
      const slug = normalizeOfferSearch(offer.slug);
      const searchable = normalizeOfferSearch([offer.name, offer.slug, offer.category, offer.description, ...offer.features].join(" "));
      const matchedTerms = terms.filter((term) => searchable.includes(term)).length;
      const exactNameBonus = normalizedQuery && name.includes(normalizedQuery) ? 8 : 0;
      const exactSlugBonus = normalizedQuery && slug.includes(normalizedQuery) ? 5 : 0;
      return { offer, score: matchedTerms * 3 + exactNameBonus + exactSlugBonus };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.offer.name.localeCompare(b.offer.name))
    .slice(0, 8)
    .map(({ offer }) => offer);
}

export async function replyToClient(phone: string, text: string, source: "whatsapp" | "simulator"): Promise<SalesAgentResult> {
  const lead = await getOrCreateLead(phone, source);
  const history = await getConversation(phone);
  let referralNotification: SalesAgentResult["referralNotification"] = null;

  const updateLeadTool = tool({
    description: "Save genuinely new client details or update the sales status. Do not ask for information that is already in the lead record. Never mark a lead converted without verified payment confirmation.",
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
    description: "Search management-approved MedMinds services, packages, prices, features and payment instructions using ordinary client wording. Use this before saying a service detail or price is unavailable. Example queries: 'master research proposal', 'Pa Gym OSCE', 'quantitative analysis'. Omit query to list all active offers.",
    inputSchema: z.object({ query: z.string().max(160).optional() }),
    execute: async ({ query }) => {
      const activeOffers = await listOffers(true);
      const offers = rankApprovedOffers(activeOffers, query);
      if (!offers.length) {
        return {
          available: false,
          instruction: "No direct approved-offer match was found. Before referring the client, search once more using a broader main service term such as research, proposal, Pa Gym, course, analysis, editing or software, or omit the query to review all active offers. Do not guess a price."
        };
      }
      return offers.map(({ slug, name, category, description, features, priceZmw, rushPriceZmw, paymentInstructions }) => ({
        slug,
        name,
        category,
        description,
        features,
        standardPriceZmw: priceZmw,
        rushPriceZmw,
        paymentInstructions
      }));
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

  const result = await agent.generate({
    prompt: `This is a chronological WhatsApp conversation. Continue it naturally from the client's latest message.\n\n${transcript}\n\nImportant:\n- Answer the unresolved client need rather than restarting the conversation.\n- If the latest message is only a nudge or repeated greeting, continue the immediately preceding unresolved issue.\n- Do not substantially repeat wording from an earlier Agent message unless the client explicitly asks you to repeat it.\n- Use approved offer data before saying a price or service detail is unavailable.\n- Reply only with the WhatsApp message to send.`
  });

  const fallback = referralNotification
    ? `I've passed that to ${referralNotification.recipientName}. They'll pick it up from here.`
    : "Sorry, I missed that. Could you send that once more?";
  const reply = (result.text.trim() || fallback).replaceAll("—", ",");
  await addMessage(phone, "assistant", reply);
  return { reply, referralNotification: referralNotification as SalesAgentResult["referralNotification"] };
}
