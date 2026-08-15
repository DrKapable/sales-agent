import { gateway, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt";
import { getAiModel } from "@/lib/env";
import { restoreChat } from "@/lib/chat-lifecycle";
import { addMessage, getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";
import { buildReferralMessage, recipientForReferral } from "@/lib/referrals";
import { createResearchPortalTask } from "@/lib/research-portal";
import { createQuote } from "@/lib/business-ops";
import { sendCommercialPdf } from "@/lib/commercial-document";
import { maybeNotifyHotLead, notifyBusinessEvent } from "@/lib/business-notifications";
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
      name: z.string().min(1).max(120).optional(), email: z.string().email().optional(), institution: z.string().min(1).max(180).optional(),
      programme: z.string().min(1).max(180).optional(), serviceInterest: z.string().min(1).max(180).optional(), deadline: z.string().min(1).max(120).optional(),
      packageName: z.string().min(1).max(180).optional(), status: z.enum(leadStatuses).optional()
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

  const clientDocumentTool = tool({
    description: "Create a formal MedMinds quotation or UNPAID invoice for the client from an active approved fixed-price offer. Use when the client explicitly asks for a quotation, quote, proforma/unpaid invoice or invoice before payment. Never invent or override a price.",
    inputSchema: z.object({
      documentType: z.enum(["quotation", "invoice"]),
      service: z.string().min(2).max(240),
      amountZmw: z.number().positive().optional(),
      details: z.string().min(3).max(1200).optional(),
      rush: z.boolean().optional()
    }),
    execute: async ({ documentType, service, amountZmw, details, rush }) => {
      const offers = await listOffers(true);
      const needle = service.trim().toLowerCase();
      const offer = offers.find((item) => {
        const name = item.name.toLowerCase();
        return name === needle || name.includes(needle) || needle.includes(name);
      });
      if (!offer) return { created: false, reason: "No active approved fixed-price offer matches that service. Human price confirmation is required." };
      const approvedAmount = rush && offer.rushPriceZmw != null ? Number(offer.rushPriceZmw) : offer.priceZmw != null ? Number(offer.priceZmw) : null;
      if (approvedAmount == null || !Number.isFinite(approvedAmount) || approvedAmount <= 0) return { created: false, reason: "This service does not have a verified fixed price. Human price confirmation is required." };
      if (amountZmw != null && Math.abs(amountZmw - approvedAmount) > 0.01) return { created: false, reason: `The requested amount does not match the approved ${rush ? "rush" : "standard"} price. Use K${approvedAmount.toLocaleString()} or request human confirmation.` };

      const currentLead = await getOrCreateLead(phone, source);
      const record = await createQuote({
        leadId: currentLead.id,
        service: offer.name,
        amountZmw: approvedAmount,
        details: details?.trim() || offer.description || `Approved MedMinds ${offer.name} service.`,
        status: documentType === "invoice" ? "INVOICE_UNPAID" : "QUOTATION"
      }) as any;
      await updateLead(phone, { serviceInterest: offer.name, status: documentType === "invoice" ? "PAYMENT PENDING" : "INTERESTED" }).catch(() => undefined);
      void notifyBusinessEvent({
        type: "quote_created",
        eventKey: `quote_created:${String(record.id)}`,
        title: documentType === "invoice" ? "New unpaid MedMinds invoice" : "New MedMinds quotation",
        body: `Service: ${offer.name}\nAmount: K${approvedAmount.toLocaleString()}\nRequested directly by the client in chat.`,
        lead: currentLead
      }).catch(() => undefined);

      if (source === "whatsapp") {
        const delivered = await sendCommercialPdf({ lead: currentLead, record });
        return { created: true, delivered: true, documentType, documentNumber: delivered.documentNumber, amountZmw: approvedAmount, service: offer.name };
      }

      const base = process.env.NEXT_PUBLIC_APP_URL || "https://sales.medmindslc.online";
      return { created: true, delivered: false, documentType, amountZmw: approvedAmount, service: offer.name, downloadUrl: `${base.replace(/\/$/, "")}/api/documents/${record.id}`, instruction: "Give this secure PDF link to the website-chat client." };
    }
  });

  const handoffTool = tool({
    description: "Assign genuine human escalations to the most appropriate MedMinds team member. Preserve any explicitly requested staff member in the reason or summary.",
    inputSchema: z.object({
      referralType: z.enum(["payment", "discount", "sales", "research", "research_specialist", "operations", "customer_support", "dispute", "legal", "marketing", "administrative", "software", "business_automation", "web_development", "cybersecurity", "general"]),
      reason: z.string().min(3).max(500), summary: z.string().min(10).max(900)
    }),
    execute: async ({ referralType, reason, summary }) => {
      const recipient = recipientForReferral(referralType, `${reason} ${summary} ${lead.serviceInterest ?? ""}`);
      const alreadyAssigned = lead.status === "HUMAN ASSISTANCE REQUIRED" && lead.assignedTo === recipient.name;
      const savedLead = await updateLead(phone, { status: "HUMAN ASSISTANCE REQUIRED", handoffReason: reason, aiPaused: false, assignedTo: recipient.name });
      const canNotifyTeam = !alreadyAssigned && Boolean(recipient.phone) && (source === "whatsapp" || /^\d{8,15}$/.test(phone));
      if (canNotifyTeam && recipient.phone) referralNotification = { phone: recipient.phone, recipientName: recipient.name, body: buildReferralMessage({ recipientName: recipient.name, lead: savedLead, reason, summary }) };
      return {
        queued: !alreadyAssigned, assignedTo: recipient.name, notificationQueued: canNotifyTeam,
        instruction: alreadyAssigned ? `${recipient.name} is already assigned. Continue helping the client.` : canNotifyTeam ? `${recipient.name} has been assigned and notified. Continue helping the client where possible.` : `${recipient.name} has been assigned internally. Do not claim a WhatsApp notification was sent.`
      };
    }
  });

  const researchTaskTool = tool({
    description: "Create an UNASSIGNED research task in the MedMinds Research Portal when a concrete research deliverable needs operational follow-through. Use only after the client has clearly requested/proceeded with a specific piece of research work or when an agreed research action must enter the work queue. Do not use for casual enquiries, price questions, greetings or vague interest. This tool never links the task to a client and never assigns operations staff.",
    inputSchema: z.object({
      title: z.string().min(3).max(240),
      brief: z.string().min(10).max(2500),
      priority: z.enum(["low", "standard", "high", "urgent"]).default("standard"),
      dueDate: z.string().max(80).optional(),
      program: z.string().max(180).optional(),
      academicLevel: z.string().max(180).optional()
    }),
    execute: async (task) => createResearchPortalTask({ ...task, lead })
  });

  const model = modelOverride || getAiModel();
  const agent = new ToolLoopAgent({
    model: gateway(model),
    instructions: `${SALES_AGENT_PROMPT}\n\nCLIENT COMMERCIAL DOCUMENTS\n- When a client explicitly asks for a quotation, quote, proforma invoice or unpaid invoice, use createClientCommercialDocument.\n- First identify the exact active approved service. The document tool itself validates the price.\n- Never invent, negotiate or manually override a document amount. If there is no verified fixed price, arrange human confirmation.\n- A quotation is not proof of payment. An invoice created here must be clearly UNPAID and must never be described as a receipt.\n- On WhatsApp, the PDF is sent directly when the tool succeeds. On website chat, give the returned secure PDF link.\n- Do not create repeated documents unless the client asks for another/revised copy.\n\nRESEARCH PORTAL ASSISTANT-ADMIN CAPABILITY\n- You have one restricted research-portal action: create an unassigned research task using createResearchPortalTask.\n- Create a portal task only when there is a concrete research deliverable or operational action that should enter the work queue, not for ordinary enquiries or price questions.\n- The task MUST remain unlinked to a client and unassigned to operations/marketing. Humans will review, link and assign it later.\n- Never tell a client that a writer, operations member or client account has been assigned merely because you created the task.\n- After successful creation, you may say the request has been placed in the MedMinds research work queue for team review.\n- Avoid duplicate tasks for the same agreed deliverable in one conversation.\n\nTEAM ROUTING\n- Dr. Mustafa Juma Phiri: Director, specialist research, payments/discounts, software, business automation, web development, cybersecurity and technical escalation.\n- Dr Kanyembo Ng'andwe: Sales Representative, marketing team and preferred closer for sales/lead conversion.\n- Mr. Madalitso Masumbu: Operations and routine research support.\n- Dr Zabibu Nandazi: customer support and marketing.\n- Counsel Chisha Chomba: disputes, legal and conflict resolution.\n- Mr Conrad Mununkha Phiri: marketing, advertising, partnerships and secretary/administration.\n- Explicit requests for a named current team member take precedence.\n\nHANDOVER CONTINUITY\n- A referral does not end your role. Keep answering new client messages where possible.\n- Do not repeatedly tell a referred client to wait.\n- Resolve short follow-ups from recent context.\n\nCurrent lead record: ${JSON.stringify(lead)}. Tool output is authoritative for offers, commercial documents, portal-task creation and prices.`,
    tools: { getApprovedOffers: approvedOffersTool, updateLead: updateLeadTool, createClientCommercialDocument: clientDocumentTool, requestHumanAssistance: handoffTool, createResearchPortalTask: researchTaskTool }
  });

  const latestStored = history.at(-1)?.role === "user" && history.at(-1)?.content === text;
  const transcript = [...history, ...(latestStored ? [] : [{ role: "user" as const, content: text }])].map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`).join("\n");
  const result = await agent.generate({ prompt: `Conversation including the client's latest message:\n${transcript}\n\nReply only with the WhatsApp message to send.` });
  const reply = (result.text.trim() || "I’ll make sure a MedMinds team member helps with that.").replaceAll("—", ",");
  await addMessage(phone, "assistant", reply);
  void maybeNotifyHotLead(phone).catch((error) => console.error("Hot-lead notification check failed", { phoneSuffix: phone.slice(-4), error }));
  return { reply, referralNotification: referralNotification as SalesAgentResult["referralNotification"] };
}
