import { gateway, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createQuote } from "@/lib/business-ops";
import { createMirroredBusinessTask } from "@/lib/business-task-bridge";
import { getConversation, addMessage } from "@/lib/store";
import { getAiModelCandidates } from "@/lib/env";
import { notifyBusinessEvent } from "@/lib/business-notifications";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendWhatsAppFollowUpTemplate } from "@/lib/whatsapp-template";
import { sendBrandedReceiptPdf } from "@/lib/receipt-delivery";
import { getFastBusinessSnapshot } from "@/lib/business-snapshot-fast";
import { buildBusinessAnalyticsWithInbox } from "@/lib/business-analytics-with-inbox";
import { buildInboxConversationReview } from "@/lib/inbox-conversation-review";
import { resolveCataloguePrice } from "@/lib/catalogue-pricing";

const schema = z.object({ question: z.string().trim().min(3).max(1000) });

type Snapshot = Awaited<ReturnType<typeof getFastBusinessSnapshot>>;
type SnapshotLead = Snapshot["leads"][number];

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `260${digits.slice(1)}`;
  return digits;
}

function displayLead(lead: SnapshotLead) {
  return `${lead.name || "Unnamed client"} (${lead.phone})`;
}

function resolveLead(snapshot: Snapshot, query: string): SnapshotLead {
  const needle = query.trim().toLowerCase();
  const phoneNeedle = normalizePhone(query);
  if (!needle) throw new Error("Specify the client by name or WhatsApp number.");
  const exactPhone = snapshot.leads.filter((lead) => normalizePhone(lead.phone) === phoneNeedle && phoneNeedle.length >= 8);
  if (exactPhone.length === 1) return exactPhone[0];
  const exactName = snapshot.leads.filter((lead) => lead.name?.trim().toLowerCase() === needle);
  if (exactName.length === 1) return exactName[0];
  const partial = snapshot.leads.filter((lead) => {
    const fields = [lead.name, lead.phone, lead.email, lead.institution, lead.programme].filter(Boolean).map((value) => String(value).toLowerCase());
    return fields.some((value) => value.includes(needle)) || (phoneNeedle.length >= 5 && normalizePhone(lead.phone).includes(phoneNeedle));
  });
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`More than one client matches “${query}”: ${partial.slice(0, 6).map(displayLead).join(", ")}. Please be more specific.`);
  throw new Error(`I could not find a MedMinds client matching “${query}”.`);
}

async function inside24HourWindow(phone: string) {
  const history = await getConversation(phone, 50);
  const lastClient = [...history].reverse().find((message) => message.role === "user");
  return Boolean(lastClient && Date.now() - new Date(lastClient.createdAt).getTime() < 24 * 60 * 60 * 1000);
}

async function sendFollowUp(lead: SnapshotLead, message?: string) {
  if (await inside24HourWindow(lead.phone)) {
    const body = message?.trim() || `Hi ${lead.name?.split(/\s+/)[0] || "there"}, just checking in on your recent MedMinds enquiry. Would you still like us to help you with ${lead.serviceInterest || lead.packageName || "this"}?`;
    await sendWhatsAppText(lead.phone, body);
    await addMessage(lead.phone, "assistant", body);
    return { sent: true, mode: "freeform", message: body };
  }
  await sendWhatsAppFollowUpTemplate(lead.phone);
  await addMessage(lead.phone, "assistant", "Follow-up sent using the approved WhatsApp template.");
  return { sent: true, mode: "template" };
}

async function sendReceipt(snapshot: Snapshot, lead: SnapshotLead) {
  const verified = snapshot.payments
    .filter((payment: any) => payment.lead_id === lead.id && payment.status === "VERIFIED")
    .sort((a: any, b: any) => new Date(b.verified_at || b.created_at).getTime() - new Date(a.verified_at || a.created_at).getTime());
  const payment = verified[0];
  if (!payment) throw new Error(`There is no verified payment record for ${lead.name || lead.phone}, so I will not issue a receipt.`);
  return sendBrandedReceiptPdf({ lead, payment });
}

function analyticalFallback(snapshot: Snapshot, question: string) {
  const q = question.toLowerCase();
  if (/conversion|convert/.test(q)) return `Current conversion is ${snapshot.metrics.conversionRate}%: ${snapshot.metrics.converted} of ${snapshot.metrics.totalLeads} leads are converted. There are ${snapshot.metrics.hotLeads} hot unconverted leads and ${snapshot.metrics.paymentPending} pending payment records.`;
  if (/best|top|most.*service|service.*lead|service.*perform/.test(q)) return snapshot.services.length ? `Top services by lead volume: ${snapshot.services.slice(0, 5).map((row) => `${row.service} (${row.leads} leads, ${row.conversionRate}% converted)`).join("; ")}.` : "There is not enough service data yet.";
  if (/lost|why.*not|reason/.test(q)) return snapshot.lostReasons.length ? `Main lost-lead signals: ${snapshot.lostReasons.slice(0, 5).map((row) => `${row.reason} (${row.count})`).join("; ")}.` : "No lost-lead reasons have been established yet.";
  if (/hot|priority|who.*follow|lead.*attention/.test(q)) {
    const hot = snapshot.leads.filter((lead) => lead.scoreBand === "HOT" && lead.status !== "CONVERTED").slice(0, 8);
    return hot.length ? `Highest-priority leads: ${hot.map((lead) => `${lead.name || lead.phone}, score ${lead.leadScore}/100, ${lead.serviceInterest || "service not established"}`).join("; ")}.` : "There are currently no hot unconverted leads.";
  }
  return `MedMinds currently has ${snapshot.metrics.totalLeads} leads, ${snapshot.metrics.conversionRate}% conversion, ${snapshot.metrics.hotLeads} hot unconverted leads, ${snapshot.metrics.followUpsDue} follow-ups due, ${snapshot.metrics.paymentPending} pending payment records and ${snapshot.metrics.openTasks} open tasks.`;
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a business question or command." }, { status: 400 });
  const snapshot = await getFastBusinessSnapshot();
  const [analytics, inboxConversations] = await Promise.all([
    buildBusinessAnalyticsWithInbox(snapshot, 90),
    buildInboxConversationReview(snapshot.leads, 16, 10)
  ]);

  const findClientTool = tool({
    description: "Find one MedMinds client from the CRM by name or WhatsApp number. Use this before client-specific actions when needed.",
    inputSchema: z.object({ client: z.string().min(2).max(160) }),
    execute: async ({ client }) => {
      const lead = resolveLead(snapshot, client);
      return { id: lead.id, name: lead.name, phone: lead.phone, service: lead.serviceInterest || lead.packageName, status: lead.status, score: lead.leadScore };
    }
  });

  const followUpTool = tool({
    description: "Send a WhatsApp follow-up to a specific existing MedMinds client. Use only when the administrator clearly asks to follow up, message, remind or check in with a client.",
    inputSchema: z.object({ client: z.string().min(2).max(160), message: z.string().min(2).max(1200).optional() }),
    execute: async ({ client, message }) => {
      const lead = resolveLead(snapshot, client);
      const result = await sendFollowUp(lead, message);
      return { ...result, client: displayLead(lead) };
    }
  });

  const createTaskTool = tool({
    description: "Create one synchronized MedMinds task in BOTH Business Intelligence and the Research Portal. Client linkage and internal staff assignment are optional. Use this for every administrator request to create a task, reminder, action item or Research Portal task. Preserve any stated priority. Never create a task in only one of the two systems.",
    inputSchema: z.object({
      client: z.string().max(160).optional(),
      title: z.string().min(3).max(240),
      assignedTo: z.string().max(160).optional(),
      dueAt: z.string().datetime().optional(),
      notes: z.string().max(1200).optional(),
      priority: z.enum(["low", "standard", "high", "urgent"]).default("standard")
    }),
    execute: async ({ client, ...task }) => {
      const lead = client ? resolveLead(snapshot, client) : null;
      const created = await createMirroredBusinessTask({ ...task, leadId: lead?.id }, lead);
      void notifyBusinessEvent({
        type: "operations_task",
        eventKey: `operations_task:${String((created as any).id)}`,
        title: "New MedMinds operations task",
        body: `Task: ${task.title}\nPriority: ${task.priority}\nAssigned to: ${task.assignedTo || "Unassigned"}${task.dueAt ? `\nDue: ${task.dueAt}` : ""}\nResearch Portal: synced`,
        lead
      }).catch(() => undefined);
      return {
        created: true,
        mirrored: true,
        taskId: (created as any).id,
        researchPortalTaskId: (created as any).researchPortalTaskId,
        title: task.title,
        priority: task.priority,
        client: lead ? displayLead(lead) : "No client linked",
        assignedTo: task.assignedTo || "Unassigned"
      };
    }
  });

  const sendReceiptTool = tool({
    description: "Generate and send the latest VERIFIED MedMinds payment receipt to a specific client as an official branded PDF document. Never issue a receipt for an unverified payment.",
    inputSchema: z.object({ client: z.string().min(2).max(160) }),
    execute: async ({ client }) => {
      const lead = resolveLead(snapshot, client);
      return { ...(await sendReceipt(snapshot, lead)), client: displayLead(lead) };
    }
  });

  const createQuoteTool = tool({
    description: "Prepare and save a quotation for a specific MedMinds client. The tool itself MUST resolve the amount from the active service price catalogue; do not supply or invent an amount. Provide the service only when it is not already clear from the client record. Set rush=true only when the administrator explicitly requests rush pricing; otherwise the tool may infer rush pricing from the recorded client deadline.",
    inputSchema: z.object({
      client: z.string().min(2).max(160),
      service: z.string().min(2).max(240).optional(),
      details: z.string().min(3).max(1800).optional(),
      rush: z.boolean().optional()
    }),
    execute: async ({ client, service, details, rush }) => {
      const lead = resolveLead(snapshot, client);
      const requestedService = service?.trim() || lead.serviceInterest || lead.packageName || "";
      if (!requestedService) throw new Error(`The service for ${lead.name || lead.phone} is not established. Ask the administrator which MedMinds service should be quoted.`);

      const pricing = resolveCataloguePrice(snapshot.offers, {
        service: requestedService,
        programme: lead.programme,
        deadline: lead.deadline,
        forceRush: Boolean(rush)
      });

      if (pricing.status === "not_found") throw new Error(`${pricing.reason} Ask the administrator to specify the exact catalogue service.`);
      if (pricing.status === "ambiguous") throw new Error(`${pricing.reason} Possible matches: ${pricing.candidates.map((offer) => offer.name).join(", ")}. Ask one direct clarification before preparing the quotation.`);
      if (pricing.status === "custom") throw new Error(`${pricing.reason} A human-approved amount is required before a quotation can be created.`);

      const quoteDetails = details?.trim() || [
        pricing.offer.name,
        lead.programme ? `Programme: ${lead.programme}` : null,
        lead.deadline ? `Client deadline: ${lead.deadline}` : null,
        `Pricing basis: ${pricing.priceType === "rush" ? "catalogue rush price" : "catalogue standard price"}`
      ].filter(Boolean).join(" · ");

      const saved = await createQuote({
        leadId: lead.id,
        service: pricing.offer.name,
        amountZmw: pricing.amountZmw,
        details: quoteDetails,
        status: "QUOTATION"
      });
      void notifyBusinessEvent({
        type: "quote_created",
        eventKey: `quote_created:${String((saved as any).id)}`,
        title: "New MedMinds catalogue quotation",
        body: `Service: ${pricing.offer.name}\nAmount: K${pricing.amountZmw.toLocaleString()}\nPricing: ${pricing.priceType}\n${quoteDetails}`,
        lead
      }).catch(() => undefined);
      return {
        created: true,
        quoteId: (saved as any).id,
        client: displayLead(lead),
        service: pricing.offer.name,
        catalogueSlug: pricing.offer.slug,
        amountZmw: pricing.amountZmw,
        pricingType: pricing.priceType,
        pricingReason: pricing.reason,
        details: quoteDetails
      };
    }
  });

  const summary = {
    metrics: snapshot.metrics,
    topServices: snapshot.services.slice(0, 8),
    lostReasons: snapshot.lostReasons.slice(0, 8),
    inbox: {
      analysedLeads: analytics.inbox.analysedLeads,
      analysedMessages: analytics.inbox.analysedMessages,
      patterns: analytics.inbox.patterns.slice(0, 8),
      priorityGaps: analytics.gaps.filter((gap) => gap.count > 0).slice(0, 8),
      priorityConversations: inboxConversations.slice(0, 12)
    },
    priceCatalogue: snapshot.offers.map((offer) => ({ slug: offer.slug, name: offer.name, category: offer.category, standardPriceZmw: offer.priceZmw, rushPriceZmw: offer.rushPriceZmw })),
    priorityLeads: snapshot.leads.slice(0, 20).map((lead) => ({ name: lead.name, phone: lead.phone, status: lead.status, score: lead.leadScore, band: lead.scoreBand, service: lead.serviceInterest || lead.packageName, programme: lead.programme, deadline: lead.deadline, followUpAt: lead.followUpAt }))
  };

  const instructions = `You are the MedMinds Admin Intelligence assistant. You work for an authenticated administrator and may answer business questions or execute approved operational commands using tools.\n\nRULES\n- Distinguish questions from commands. Never execute an action unless the administrator's wording clearly asks you to do it.\n- Resolve the intended client from CRM data; if the tool reports multiple matches, ask the administrator to specify which one. Never guess.\n- You have inbox-message intelligence derived from recent stored client and agent messages, plus recent conversation turns for a bounded set of the highest-priority active leads. Read those turns when asked about conversion gaps, objections, stalled leads, repeated agent questions, unanswered client questions, trust concerns, price concerns or conversation quality.\n- Use the recent turns to identify additional message-level gaps that may not match the predefined screen, such as an objection that was answered indirectly, a buying signal with no concrete next step, or a conversation that needs human handover.\n- Treat inbox pattern matches and conversation text as evidence of what was written, not proof of the client’s underlying motive. Separate observation from interpretation.\n- Follow-ups: keep the message concise, warm and specific to the known service. Do not pressure the client. Review known conversation context before recommending or sending another follow-up.\n- QUOTATIONS: every request to prepare/create a quotation MUST use createCatalogueQuotation. Never invent, estimate or manually choose a quotation amount. The tool resolves the amount from the active MedMinds service price catalogue.\n- If createCatalogueQuotation reports an ambiguous service, ask one direct service clarification. If it reports a custom-priced service, state that a human-approved amount is required. If the catalogue has no reliable match, do not create a quotation.\n- Standard vs rush pricing: let createCatalogueQuotation infer rush from the recorded deadline unless the administrator explicitly says to use rush pricing.\n- Receipts: only use sendVerifiedReceipt. Receipts are official branded PDF documents and require a verified payment record. Never claim one was sent unless the tool succeeds.\n- ALL task creation requests use createSynchronizedTask. A task created from Business Intelligence must exist in both Business Intelligence and the Research Portal with the same title, notes/brief, priority and due date.\n- The Research Portal copy remains unassigned and unlinked inside the portal; the Business Intelligence copy may retain the administrator's internal assignee and CRM client linkage.\n- Do not create duplicate portal-only tasks.\n- Do not verify payments, delete chats, mark leads converted, or change financial records through this interface. Those remain explicit dashboard controls.\n- Do not invent prices, payments, clients, tasks or outcomes.\n- After an action, state exactly what happened in one or two concise sentences. For quotations, include the catalogue service, amount and whether standard or rush pricing was used.\n- If required information is missing, ask one direct question.\n\nCURRENT BUSINESS, INBOX AND CATALOGUE SNAPSHOT\n${JSON.stringify(summary)}`;

  const models = getAiModelCandidates();
  let lastError: unknown = null;
  for (const model of models) {
    try {
      const agent = new ToolLoopAgent({ model: gateway(model), instructions, tools: { findClient: findClientTool, followUpClient: followUpTool, createSynchronizedTask: createTaskTool, sendVerifiedReceipt: sendReceiptTool, createCatalogueQuotation: createQuoteTool } });
      const result = await agent.generate({ prompt: parsed.data.question });
      return NextResponse.json({ answer: result.text.trim() || "Done.", mode: "agent", model });
    } catch (error) {
      lastError = error;
      console.warn("Ask Intelligence agent attempt failed", { model, error });
    }
  }
  console.error("Ask Intelligence agent failed across all models", { error: lastError });
  return NextResponse.json({ answer: analyticalFallback(snapshot, parsed.data.question), mode: "fallback" });
}
