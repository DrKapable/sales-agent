import { gateway, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { SALES_AGENT_PROMPT } from "@/lib/ai/prompt-kaunda";
import { getAiModel } from "@/lib/env";
import { restoreChat } from "@/lib/chat-lifecycle";
import { getClientDocumentForLead, listClientDocuments } from "@/lib/client-documents";
import { addMessage, getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";
import { buildReferralMessage, recipientForReferral } from "@/lib/referrals";
import { createResearchPortalTask } from "@/lib/research-portal";
import { createQuote } from "@/lib/business-ops";
import { sendCommercialPdf } from "@/lib/commercial-document";
import { maybeNotifyHotLead, notifyBusinessEvent } from "@/lib/business-notifications";
import { assessLeadQualification, type LeadQualification } from "@/lib/lead-qualification";
import { resolveCataloguePrice } from "@/lib/catalogue-pricing";
import { getLatestPreparedQuotationForService, preparedQuotationPriceState } from "@/lib/prepared-quotation";
import { leadStatuses, type LeadPatch } from "@/lib/types";

export type SalesAgentResult = {
  reply: string;
  referralNotification: { phone: string; recipientName: string; body: string } | null;
  documentIds: string[];
};

function qualificationGuidance(qualification: LeadQualification) {
  if (qualification.qualified) return "Enough information is known for the current commercial step.";
  if (qualification.missing === "programme") return "The client's programme or academic level is still missing. Ask for it naturally only if it is needed for the next decision.";
  if (qualification.missing === "deadline") return "The client's timing or deadline is still missing. Ask naturally when they need the work, without forcing a specific date format.";
  if (qualification.missing === "format") return "The required option or format is still missing. Ask naturally which option fits them.";
  if (qualification.missing === "scope") return "The specific scope or outcome is still unclear. Ask one natural question that helps the client describe what they want done.";
  if (qualification.missing === "path") return "The client has not yet chosen between self-directed learning and hands-on support. Clarify the route naturally from the conversation.";
  if (qualification.missing === "need") return "The exact need is still unclear. Ask one simple, context-aware question about what result the client wants.";
  return "Continue the conversation naturally and clarify only what is genuinely necessary.";
}

export async function replyToClient(phone: string, text: string, source: "whatsapp" | "simulator", modelOverride?: string): Promise<SalesAgentResult> {
  await restoreChat(phone).catch(() => undefined);
  let lead = await getOrCreateLead(phone, source);
  const history = await getConversation(phone);
  let referralNotification: SalesAgentResult["referralNotification"] = null;
  const queuedDocumentIds = new Set<string>();

  const qualification = assessLeadQualification({ lead, history, latestText: text });
  const canRevealCommercialTerms = qualification.qualified || qualification.priorPriceContext || lead.status === "PAYMENT PENDING" || lead.status === "CONVERTED";

  if (qualification.qualified && lead.status === "NEW LEAD") {
    lead = await updateLead(phone, { status: "QUALIFIED" }).catch(() => lead);
  }

  const updateLeadTool = tool({
    description: "Save client details that are genuinely supported by the conversation or update the sales status. Interpret short answers in the context of the immediately preceding conversation. Never mark a lead converted without verified payment confirmation.",
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
    description: "Retrieve active, management-approved MedMinds offers. Pricing and payment instructions remain locked until qualification is sufficient. Use the returned qualification state as guidance, not as scripted wording.",
    inputSchema: z.object({ category: z.string().max(80).optional() }),
    execute: async ({ category }) => {
      const offers = (await listOffers(true)).filter((offer) => !category || offer.category.toLowerCase().includes(category.toLowerCase()));
      if (!offers.length) return { available: false, instruction: "No verified active offer matches this request. Do not guess. Arrange human confirmation." };
      if (!canRevealCommercialTerms) {
        return {
          available: true,
          pricingAvailable: false,
          missing: qualification.missing,
          instruction: qualificationGuidance(qualification),
          offers: offers.map(({ name, category: offerCategory, description, features }) => ({ name, category: offerCategory, description, features }))
        };
      }
      return {
        available: true,
        pricingAvailable: true,
        offers: offers.map(({ name, category: offerCategory, description, features, priceZmw, rushPriceZmw, paymentInstructions }) => ({
          name,
          category: offerCategory,
          description,
          features,
          standardPriceZmw: priceZmw,
          rushPriceZmw,
          paymentInstructions
        }))
      };
    }
  });

  const clientDocumentTool = tool({
    description: "Create or reuse a formal MedMinds quotation or UNPAID invoice from the approved catalogue only after qualification. The server, not Mary, decides the exact approved amount from the client's service, programme and deadline. Never guess a price and never create a second conflicting quotation for the same service.",
    inputSchema: z.object({
      documentType: z.enum(["quotation", "invoice"]),
      service: z.string().min(2).max(240),
      details: z.string().min(3).max(1200).optional()
    }),
    execute: async ({ documentType, service, details }) => {
      if (!canRevealCommercialTerms) return { created: false, reason: "The lead must be qualified before a quotation or invoice can be created.", missing: qualification.missing };

      const currentLead = await getOrCreateLead(phone, source);
      const offers = await listOffers(true);
      const pricing = resolveCataloguePrice(offers, {
        service,
        programme: currentLead.programme,
        deadline: currentLead.deadline
      });

      if (pricing.status === "not_found") return { created: false, reason: pricing.reason, requiresHumanReview: true };
      if (pricing.status === "ambiguous") return { created: false, reason: pricing.reason, requiresClarification: true, candidates: pricing.candidates.map((item) => item.name) };
      if (pricing.status === "custom") return { created: false, reason: pricing.reason, requiresHumanReview: true, service: pricing.offer.name };

      const approvedAmount = Number(pricing.amountZmw);
      const offer = pricing.offer;

      if (documentType === "quotation") {
        const existing = await getLatestPreparedQuotationForService(currentLead.id, offer.name).catch(() => null);
        const priceState = preparedQuotationPriceState(existing, approvedAmount);
        if (existing && priceState === "different") {
          return {
            created: false,
            reused: false,
            requiresHumanReview: true,
            service: offer.name,
            existingQuotationId: existing.id,
            existingAmountZmw: existing.amount_zmw,
            approvedAmountZmw: approvedAmount,
            reason: "An active quotation already exists for this same service at a different amount. Do not issue another quotation automatically. A human must review or revise the existing quotation."
          };
        }
        if (existing && priceState === "same") {
          await updateLead(phone, { serviceInterest: offer.name, status: "INTERESTED" }).catch(() => undefined);
          if (source === "whatsapp") {
            const delivered = await sendCommercialPdf({ lead: currentLead, record: existing });
            return { created: false, reused: true, delivered: true, documentType, documentNumber: delivered.documentNumber, amountZmw: approvedAmount, service: offer.name, priceType: pricing.priceType };
          }
          const base = process.env.NEXT_PUBLIC_APP_URL || "https://sales.medmindslc.online";
          return { created: false, reused: true, delivered: false, documentType, amountZmw: approvedAmount, service: offer.name, priceType: pricing.priceType, downloadUrl: `${base.replace(/\/$/, "")}/api/documents/${existing.id}` };
        }
      }

      const record = await createQuote({
        leadId: currentLead.id,
        service: offer.name,
        amountZmw: approvedAmount,
        details: details?.trim() || [offer.description, currentLead.programme ? `Programme/level: ${currentLead.programme}` : null, currentLead.deadline ? `Client deadline: ${currentLead.deadline}` : null, `Pricing basis: approved ${pricing.priceType} price`].filter(Boolean).join(" · "),
        status: documentType === "invoice" ? "INVOICE_UNPAID" : "QUOTATION"
      }) as any;

      await updateLead(phone, { serviceInterest: offer.name, status: documentType === "invoice" ? "PAYMENT PENDING" : "INTERESTED" }).catch(() => undefined);
      void notifyBusinessEvent({
        type: "quote_created",
        eventKey: `quote_created:${String(record.id)}`,
        title: documentType === "invoice" ? "New unpaid MedMinds invoice" : "New MedMinds quotation",
        body: `Service: ${offer.name}\nAmount: K${approvedAmount.toLocaleString()}\nPricing: approved ${pricing.priceType} price.`,
        lead: currentLead
      }).catch(() => undefined);

      if (source === "whatsapp") {
        const delivered = await sendCommercialPdf({ lead: currentLead, record });
        return { created: true, reused: false, delivered: true, documentType, documentNumber: delivered.documentNumber, amountZmw: approvedAmount, service: offer.name, priceType: pricing.priceType };
      }

      const base = process.env.NEXT_PUBLIC_APP_URL || "https://sales.medmindslc.online";
      return { created: true, reused: false, delivered: false, documentType, amountZmw: approvedAmount, service: offer.name, priceType: pricing.priceType, downloadUrl: `${base.replace(/\/$/, "")}/api/documents/${record.id}`, instruction: "Give this secure PDF link to the website-chat client." };
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
    description: "Assign genuine human fulfilment, specialist review or escalation to the most appropriate MedMinds team member. Preserve any explicitly requested staff member in the reason or summary. Routine qualification and ordinary sales questions should remain with Mary.",
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
        queued: !alreadyAssigned,
        assignedTo: recipient.name,
        notificationQueued: canNotifyTeam,
        instruction: alreadyAssigned
          ? `${recipient.name} is already assigned. Continue handling permitted sales and coordination questions.`
          : canNotifyTeam
            ? `${recipient.name} has been assigned and notified. Continue handling permitted sales and coordination questions.`
            : `${recipient.name} has been assigned internally. Do not claim a WhatsApp notification was sent.`
      };
    }
  });

  const researchTaskTool = tool({
    description: "Create an UNASSIGNED research task in the MedMinds Research Portal after the client has clearly agreed to proceed with a concrete research service or an agreed research deliverable needs operational follow-through. Do not use for casual enquiries, price questions or vague interest.",
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

  const qualificationForModel = {
    qualified: qualification.qualified,
    priorPriceContext: qualification.priorPriceContext,
    kind: qualification.kind,
    missing: qualification.missing,
    commercialIntent: qualification.commercialIntent,
    guidance: qualificationGuidance(qualification)
  };

  const model = modelOverride || getAiModel();
  const agent = new ToolLoopAgent({
    model: gateway(model),
    instructions: `${SALES_AGENT_PROMPT}\n\nNATURAL CONVERSATION OVERRIDE\n- These rules override any earlier fixed or example wording. Do not use preset qualification questions or stock CRM-style responses.\n- Speak like a capable human sales representative having one continuous WhatsApp conversation. Use the client's own words and the immediate context.\n- CURRENT QUALIFICATION STATE is a business guardrail, not a script. Its missing field tells you what information is still needed; phrase any question naturally and differently according to the conversation.\n- Never tell the client internal labels such as qualified, missing, lead stage, route, state machine or qualification.\n- Interpret short replies in context. If you just asked when they need the work and they say \"2 weeks\", that is a timeframe. If you asked their academic level and they say \"Diploma\", that is the level.\n- If the client says \"yes please\", \"okay\", \"go ahead\" or similar after you offered a specific action such as preparing a quotation, treat it as acceptance of that action. Do not ask the same action question again.\n- Answer clarification questions directly. Do not force every message back into qualification.\n- Ask at most one useful question at a time, and only when a missing detail is genuinely needed for the next commercial step.\n- Do not repeat a question whose answer is already present in the transcript or lead record.\n- Natural small talk is allowed. Resume the sales journey only when the client returns to it.\n\nCOMMERCIAL GUARDRAILS\n- Do not reveal prices, payment instructions, quotation amounts or invoice amounts while CURRENT QUALIFICATION STATE says qualified=false unless priorPriceContext=true or the lead is already PAYMENT PENDING/CONVERTED.\n- When a qualified client asks for or clearly accepts an offer to prepare a quotation, use createClientCommercialDocument.\n- The createClientCommercialDocument tool is authoritative for price. It calculates the approved catalogue amount from the current service, programme and deadline. Never choose rush/standard pricing yourself and never invent or override the amount.\n- If the tool reports an existing same-service quotation at a different amount, do not create or promise another quotation. Explain briefly that the existing quotation needs human review and use human assistance when appropriate.\n- If the tool reuses an existing quotation, tell the client naturally that the existing quotation has been resent/reused; do not imply a new quotation was created.\n- A quotation is not proof of payment. An invoice created here is UNPAID. Official receipts may be sent only after verified payment.\n- Do not create repeated documents unless a genuine revised document has been approved by a human.\n\nCLIENT-ASSIGNED DOCUMENTS\n- Administrators can upload documents and assign them to a specific client. If a client asks for an assigned file, first use listAssignedClientDocuments, then send only a document returned for this client.\n- If no document is assigned, say so plainly and arrange human assistance if needed.\n\nRESEARCH SALES VS FULFILMENT\n- Mary may explain and sell research services, collect requirements naturally, recommend the best-fit approved service, retrieve approved prices after qualification, prepare quotations/invoices, explain payment terms and coordinate next steps.\n- Mary must not personally produce substantive research work. Routine fulfilment goes to Dr. Monica; advanced methodology/statistics/director-level research goes to Dr. Mustafa Juma Phiri.\n- Do not refer a research client merely because they want hands-on proposal/dissertation support. Complete the sales conversation first unless the client explicitly asks for a human or a specialist-only issue arises.\n- A fulfilment referral does not end Mary's sales role.\n\nTEAM ROUTING\n- Dr. Mustafa Juma Phiri: Director, specialist research, payments/discounts, software, business automation, web development, cybersecurity and technical escalation.\n- Dr Kanyembo Ng'andwe: Sales Representative, marketing and preferred closer for lead conversion.\n- Dr. Monica: Operations and routine research support.\n- Dr Zabibu Nandazi: customer support and marketing.\n- Counsel Chisha Chomba: disputes, legal and conflict resolution.\n- Mr Conrad Mununkha Phiri: marketing, advertising, partnerships and secretary/administration.\n- Mr. Madalitso Masumbu is off duty and must not receive new referrals.\n\nRESEARCH PORTAL\n- Create an unassigned research task only after the client has clearly agreed to proceed with a concrete research service or an agreed deliverable needs operational follow-through. Do not create tasks for ordinary enquiries or price questions.\n- Do not invent research content to populate a task.\n\nCurrent lead record: ${JSON.stringify(lead)}.\nCURRENT QUALIFICATION STATE: ${JSON.stringify(qualificationForModel)}.\nTool output is authoritative for approved offers, prices, commercial documents, assigned documents and Research Portal actions.`,
    tools: {
      getApprovedOffers: approvedOffersTool,
      updateLead: updateLeadTool,
      createClientCommercialDocument: clientDocumentTool,
      listAssignedClientDocuments: listAssignedDocumentsTool,
      sendAssignedClientDocument: sendAssignedDocumentTool,
      requestHumanAssistance: handoffTool,
      createResearchPortalTask: researchTaskTool
    }
  });

  const latestStored = history.at(-1)?.role === "user" && history.at(-1)?.content === text;
  const transcript = [...history, ...(latestStored ? [] : [{ role: "user" as const, content: text }])]
    .map((message) => `${message.role === "user" ? "Client" : "Agent"}: ${message.content}`)
    .join("\n");
  const result = await agent.generate({ prompt: `Conversation including the client's latest message:\n${transcript}\n\nReply only with the natural WhatsApp message to send. Do not expose internal reasoning, qualification labels or tool details.` });
  const reply = (result.text.trim() || "I’ll make sure a MedMinds team member helps with that.").replaceAll("—", ",");
  await addMessage(phone, "assistant", reply);
  void maybeNotifyHotLead(phone).catch((error) => console.error("Hot-lead notification check failed", { phoneSuffix: phone.slice(-4), error }));
  return { reply, referralNotification: referralNotification as SalesAgentResult["referralNotification"], documentIds: [...queuedDocumentIds] };
}
