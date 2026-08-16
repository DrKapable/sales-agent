import { gateway, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt";
import { getAiModel } from "@/lib/env";
import { restoreChat } from "@/lib/chat-lifecycle";
import { getClientDocumentForLead, listClientDocuments } from "@/lib/client-documents";
import { addMessage, getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";
import { buildReferralMessage, recipientForReferral } from "@/lib/referrals";
import { createQuote } from "@/lib/business-ops";
import { sendCommercialPdf } from "@/lib/commercial-document";
import { maybeNotifyHotLead, notifyBusinessEvent } from "@/lib/business-notifications";
import { leadStatuses, type LeadPatch, type Offer } from "@/lib/types";

export type SalesAgentResult = {
  reply: string;
  referralNotification: { phone: string; recipientName: string; body: string } | null;
  documentIds: string[];
};

function isHandsOnResearchOffer(offer: Pick<Offer, "category">) {
  const category = offer.category.toLowerCase();
  return category.includes("research") || category.includes("data analysis") || category.includes("editing");
}

export async function replyToClient(phone: string, text: string, source: "whatsapp" | "simulator", modelOverride?: string): Promise<SalesAgentResult> {
  await restoreChat(phone).catch(() => undefined);
  const lead = await getOrCreateLead(phone, source);
  const history = await getConversation(phone);
  let referralNotification: SalesAgentResult["referralNotification"] = null;
  const queuedDocumentIds = new Set<string>();

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
    description: "Retrieve active management-approved NON-RESEARCH packages, prices, features, and payment instructions. Hands-on research, data-analysis and research-editing services must be referred to the research team instead of quoted by Mary.",
    inputSchema: z.object({ category: z.string().max(80).optional() }),
    execute: async ({ category }) => {
      const requestedCategory = category?.trim().toLowerCase() || "";
      if (requestedCategory && ["research", "data analysis", "editing"].some((item) => requestedCategory.includes(item))) {
        return { available: false, instruction: "Mary is not authorised to quote hands-on research services. Use requestHumanAssistance for the appropriate research team member." };
      }
      const offers = (await listOffers(true))
        .filter((offer) => !isHandsOnResearchOffer(offer))
        .filter((offer) => !category || offer.category.toLowerCase().includes(requestedCategory));
      return offers.length
        ? offers.map(({ name, category: offerCategory, description, features, priceZmw, rushPriceZmw, paymentInstructions }) => ({ name, category: offerCategory, description, features, standardPriceZmw: priceZmw, rushPriceZmw, paymentInstructions }))
        : { available: false, instruction: "No verified active non-research offer matches this request. Do not guess. Arrange human confirmation." };
    }
  });

  const clientDocumentTool = tool({
    description: "Create a formal MedMinds quotation or UNPAID invoice for an approved NON-RESEARCH fixed-price offer. Never create a quotation or invoice for hands-on research, data-analysis or research-editing services; those require research-team assessment.",
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
      if (!offer) return { created: false, reason: "No active approved fixed-price offer matches that service. Human confirmation is required." };
      if (isHandsOnResearchOffer(offer)) {
        return { created: false, reason: "Mary is not authorised to quote or invoice hands-on research services. Refer the client to the appropriate research team member." };
      }
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

  const listAssignedDocumentsTool = tool({
    description: "List documents that a MedMinds administrator has explicitly assigned to this client. Use this when the client asks for a file, document, form, report, letter, proposal, quotation copy or other attachment that may already be assigned to them.",
    inputSchema: z.object({}),
    execute: async () => {
      const documents = await listClientDocuments(lead.id);
      if (!documents.length) return { available: false, documents: [], instruction: "No administrator-assigned documents are available for this client." };
      return {
        available: true,
        documents: documents.map((item) => ({ id: item.id, title: item.title, fileName: item.fileName, mimeType: item.mimeType, lastSentAt: item.lastSentAt }))
      };
    }
  });

  const sendAssignedDocumentTool = tool({
    description: "Queue one administrator-assigned document for WhatsApp delivery to this client. Use only a document ID returned by listAssignedClientDocuments and only when the client has asked for or clearly needs that document.",
    inputSchema: z.object({ documentId: z.string().uuid() }),
    execute: async ({ documentId }) => {
      if (source !== "whatsapp") return { queued: false, reason: "Assigned-document delivery is available only in the WhatsApp conversation." };
      const document = await getClientDocumentForLead(documentId, lead.id);
      if (!document) return { queued: false, reason: "That document is not assigned to this client." };
      queuedDocumentIds.add(document.id);
      return { queued: true, documentId: document.id, title: document.title, fileName: document.fileName, instruction: "The attachment is queued for this WhatsApp response." };
    }
  });

  const handoffTool = tool({
    description: "Assign genuine human escalations to the most appropriate MedMinds team member. Hands-on research services must always be escalated. Preserve any explicitly requested staff member in the reason or summary.",
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
        instruction: alreadyAssigned ? `${recipient.name} is already assigned. Stay within Mary's permitted role.` : canNotifyTeam ? `${recipient.name} has been assigned and notified. Stay within Mary's permitted role.` : `${recipient.name} has been assigned internally. Do not claim a WhatsApp notification was sent.`
      };
    }
  });

  const model = modelOverride || getAiModel();
  const agent = new ToolLoopAgent({
    model: gateway(model),
    instructions: `${SALES_AGENT_PROMPT}\n\nCLIENT COMMERCIAL DOCUMENTS\n- When a client explicitly asks for a quotation, quote, proforma invoice or unpaid invoice for a permitted NON-RESEARCH service, use createClientCommercialDocument.\n- Never create a quotation or invoice for hands-on research, data-analysis or research-editing work. Refer those requests to the research team.\n- First identify the exact active approved non-research service. The document tool itself validates the price.\n- Never invent, negotiate or manually override a document amount. If there is no verified fixed price, arrange human confirmation.\n- A quotation is not proof of payment. An invoice created here must be clearly UNPAID and must never be described as a receipt.\n- On WhatsApp, the PDF is sent directly when the tool succeeds. On website chat, give the returned secure PDF link.\n- Do not create repeated documents unless the client asks for another/revised copy.\n\nCLIENT-ASSIGNED DOCUMENTS\n- Administrators can upload documents and assign them to a specific client. These are separate from generated quotations and invoices.\n- If a client asks you to send, resend, share or attach a document that may have been assigned to them, first use listAssignedClientDocuments.\n- You may queue only a document returned for this exact client by listAssignedClientDocuments. Never guess a document ID, file URL or filename and never access another client's documents.\n- If exactly one assigned document clearly matches the client's request, use sendAssignedClientDocument with that document ID. If several documents could match, ask the client which one they need.\n- If no document is assigned, say that you cannot see an assigned copy yet and arrange human assistance if needed. Do not pretend a file was sent.\n- After sendAssignedClientDocument succeeds, keep the accompanying text brief and natural, for example: "I've sent the document here."\n\nRESEARCH SERVICE RESTRICTION\n- You have NO Research Portal task-creation capability.\n- Never create, accept, scope, quote or perform research work for a client.\n- For routine research support, use requestHumanAssistance with referralType "research" so Dr. Monica can assess it.\n- For advanced methodology, specialist research design, complex statistics or director-level research, use referralType "research_specialist" so Dr. Mustafa Juma Phiri can assess it.\n- The AI-Assisted Research Proposal Writing course remains a permitted training product and may be sold normally.\n\nTEAM ROUTING\n- Dr. Mustafa Juma Phiri: Director, specialist research, payments/discounts, software, business automation, web development, cybersecurity and technical escalation.\n- Dr Kanyembo Ng'andwe: Sales Representative, marketing team and preferred closer for sales/lead conversion.\n- Dr. Monica: Operations and routine research support.\n- Mr. Madalitso Masumbu is currently off duty and must not receive new referrals.\n- Dr Zabibu Nandazi: customer support and marketing.\n- Counsel Chisha Chomba: disputes, legal and conflict resolution.\n- Mr Conrad Mununkha Phiri: marketing, advertising, partnerships and secretary/administration.\n- Explicit requests for a named current team member take precedence, except that off-duty staff must not receive new referrals.\n\nHANDOVER CONTINUITY\n- A referral does not end your role for permitted questions, but do not continue doing the referred research work.\n- Do not repeatedly tell a referred client to wait.\n- Resolve short non-research follow-ups from recent context.\n\nCurrent lead record: ${JSON.stringify(lead)}. Tool output is authoritative for permitted offers, commercial documents and assigned client documents.`,
    tools: {
      getApprovedOffers: approvedOffersTool,
      updateLead: updateLeadTool,
      createClientCommercialDocument: clientDocumentTool,
      listAssignedClientDocuments: listAssignedDocumentsTool,
      sendAssignedClientDocument: sendAssignedDocumentTool,
      requestHumanAssistance: handoffTool
    }
  });

  const latestStored = history.at(-1)?.role === "user" && history.at(-1)?.content === text;
  const transcript = [...history, ...(latestStored ? [] : [{ role: "user" as const, content: text }])].map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`).join("\n");
  const result = await agent.generate({ prompt: `Conversation including the client's latest message:\n${transcript}\n\nReply only with the WhatsApp message to send.` });
  const reply = (result.text.trim() || "I’ll make sure a MedMinds team member helps with that.").replaceAll("—", ",");
  await addMessage(phone, "assistant", reply);
  void maybeNotifyHotLead(phone).catch((error) => console.error("Hot-lead notification check failed", { phoneSuffix: phone.slice(-4), error }));
  return { reply, referralNotification: referralNotification as SalesAgentResult["referralNotification"], documentIds: [...queuedDocumentIds] };
}
