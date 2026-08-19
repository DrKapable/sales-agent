import { createQuote } from "@/lib/business-ops";
import { resolveCataloguePrice } from "@/lib/catalogue-pricing";
import { sendCommercialPdf } from "@/lib/commercial-document";
import { notifyBusinessEvent } from "@/lib/business-notifications";
import { getLatestPreparedQuotation } from "@/lib/prepared-quotation";
import { addMessage, getConversation, getOrCreateLead, listOffers, updateLead } from "@/lib/store";

export type ResearchSalesFlowResult = {
  reply: string;
  referralNotification: null;
  documentIds: string[];
};

const HUMAN_REQUEST = /\b(speak|talk|connect|refer|transfer|human|researcher|specialist)\b.{0,60}\b(monika|monica|mustafa|doctor|dr\.?|person|human|researcher|specialist|team)\b|\b(dr\.?\s*(?:monika|monica|mustafa)|human assistance|human agent)\b/i;
const COMMERCIAL_INTENT = /\b(how much|price|pricing|cost|fee|fees|charge|charges|rate|quotation|quote|proforma|pro-forma|invoice|proceed|go ahead|start the work|start this|ready to proceed|ready to start|book the service)\b/i;
const LEGACY_PREMATURE_HANDOFF = /client asked mary to perform (?:hands-on|specialist) research work/i;
const HUMAN_REPLY = /^\[Human: [^\]]+]\s*/;
const SELF_DIRECTED = /\b(?:do|write|work on|complete|finish)\b.{0,45}\bmyself\b|\bself[- ]?paced\b|\bproposal writing course\b|\bresearch proposal writing course\b/i;
const HANDS_ON_RESEARCH = /\b(?:help|assist|support)\b.{0,45}\b(?:actual\s+)?(?:proposal|dissertation|thesis|research|methodology|literature review|data analysis|chapter|questionnaire|topic)\b|\b(?:actual\s+proposal|hands[- ]?on|research support|do it for me|complete it for me)\b/i;
const RESEARCH_CONTEXT = /\b(proposal|dissertation|thesis|research|methodology|literature review|data analysis|statistical analysis|qualitative analysis|mixed methods|questionnaire|data collection|chapter\s*[1-6]|results|discussion|editing|proofread|referencing|research topic|topic development|manuscript|plagiarism|ai detection)\b/i;
const DEADLINE_PATTERN = /\b(?:asap|urgent|rush|today|tomorrow|this week|next week|next month|within\s+\d+\s*(?:hours?|days?|weeks?)|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2})\b/i;

export function isExplicitResearchHumanRequest(text: string) {
  return HUMAN_REQUEST.test(text.trim());
}

export function researchSalesHasCommercialIntent(clientTranscript: string) {
  return COMMERCIAL_INTENT.test(clientTranscript);
}

function classifyResearchService(text: string) {
  const normalized = text.toLowerCase();
  if (/\bproposal\b/.test(normalized)) return "Research Proposal";
  if (/\b(dissertation|thesis)\b/.test(normalized)) return "Dissertation or Thesis";
  if (/\bmixed[- ]?methods?\b/.test(normalized) && /\banalys/.test(normalized)) return "Mixed-Methods Analysis";
  if (/\bqualitative\b/.test(normalized) && /\banalys/.test(normalized)) return "Qualitative Analysis";
  if (/\b(quantitative|statistical|statistics|data analysis)\b/.test(normalized) && !/\bqualitative\b/.test(normalized)) return "Quantitative Analysis";
  if (/\b(data collection tool|questionnaire|survey tool)\b/.test(normalized)) return "Data Collection Tool";
  if (/\bdata collection\b/.test(normalized)) return "Data Collection";
  if (/\b(research topic|topic development)\b/.test(normalized)) return "Research Topic Development";
  if (/\bsupervisor corrections?\b/.test(normalized)) return "Supervisor Corrections";
  if (/\bresearch paper editing\b/.test(normalized)) return "Research Paper Editing";
  if (/\bproofread/.test(normalized)) return "Proofreading";
  if (/\bacademic editing\b/.test(normalized)) return "Academic Editing";
  if (/\bplagiarism (?:check|report)\b/.test(normalized)) return "Plagiarism Check Report";
  if (/\bai (?:detection|check|report)\b/.test(normalized)) return "AI Detection Report";
  if (/\breduce plagiarism\b/.test(normalized)) return "Reduce Plagiarism";
  if (/\breduce ai detection\b/.test(normalized)) return "Reduce AI Detection";
  if (/\bmanuscript\b/.test(normalized)) return "Manuscript Writing";
  return null;
}

export function inferResearchCatalogueService(clientTranscript: string, storedService?: string | null) {
  const messages = clientTranscript.split(/\n+/).map((message) => message.trim()).filter(Boolean);
  for (const message of [...messages].reverse()) {
    const inferred = classifyResearchService(message);
    if (inferred) return inferred;
  }

  const stored = String(storedService || "").trim();
  const inferredStored = classifyResearchService(stored);
  if (inferredStored) return inferredStored;
  return stored && !/^research (?:support|enquiry)$/i.test(stored) ? stored : "Research support";
}

function lastResearchRoute(clientMessages: string[]) {
  for (const message of [...clientMessages].reverse()) {
    if (SELF_DIRECTED.test(message)) return "course" as const;
    if (HANDS_ON_RESEARCH.test(message)) return "research" as const;
  }
  return null;
}

function inferProgramme(clientMessages: string[], storedProgramme?: string | null) {
  if (storedProgramme?.trim()) return storedProgramme.trim();
  const text = clientMessages.join(" ");
  if (/\b(phd|doctorate|doctoral)\b/i.test(text)) return "PhD/Doctoral";
  if (/\b(masters?|master['’]?s|msc|mph|ma\b|mmed|postgraduate|post-graduate)\b/i.test(text)) return "Master's/Postgraduate";
  if (/\b(undergraduate|bachelor['’]?s|degree|bsc|ba\b|mbchb)\b/i.test(text)) return "Undergraduate/Bachelor's";
  if (/\bdiploma\b/i.test(text)) return "Diploma";
  return null;
}

export function inferResearchDeadline(clientMessages: string[], storedDeadline?: string | null) {
  if (storedDeadline?.trim()) return storedDeadline.trim();
  for (const message of [...clientMessages].reverse()) {
    const match = message.match(DEADLINE_PATTERN)?.[0];
    if (!match) continue;
    if (/^\d{1,2}\s+[a-z]+$/i.test(match)) return `${match} ${new Date().getFullYear()}`;
    return match;
  }
  return null;
}

function isResearchPreSaleContext(clientMessages: string[], storedService?: string | null) {
  const latestRoute = lastResearchRoute(clientMessages);
  if (latestRoute === "course") return false;
  if (latestRoute === "research") return true;
  if (/^ai-assisted research proposal writing$/i.test(String(storedService || "").trim())) return false;
  if (/^research (?:support|enquiry)$/i.test(String(storedService || "").trim())) return true;
  return RESEARCH_CONTEXT.test(`${storedService || ""} ${clientMessages.join(" ")}`);
}

async function repairLegacyPrematureHandoff(phone: string, lead: Awaited<ReturnType<typeof getOrCreateLead>>, history: Awaited<ReturnType<typeof getConversation>>) {
  if (lead.status !== "HUMAN ASSISTANCE REQUIRED" || !LEGACY_PREMATURE_HANDOFF.test(lead.handoffReason || "")) return lead;
  const humanHasReplied = history.some((message) => message.role === "assistant" && HUMAN_REPLY.test(message.content));
  if (humanHasReplied) return lead;
  return updateLead(phone, { status: "QUALIFIED", handoffReason: null, assignedTo: null, aiPaused: false }).catch(() => lead);
}

function serviceQuestionLabel(exactService: string) {
  if (exactService === "Dissertation or Thesis") return "dissertation/thesis";
  if (exactService === "Research Proposal") return "research proposal";
  return exactService.toLowerCase();
}

export function researchQualificationQuestion(exactService: string, programme: string | null, deadline: string | null) {
  if (exactService === "Research support") return "What specific part of the research work do you want MedMinds to handle?";
  if (!programme) return `To match the right ${serviceQuestionLabel(exactService)} service and fee, what programme or academic level is this for: diploma, bachelor’s, master’s or PhD?`;
  if (!deadline) return "What deadline are you working toward?";
  return null;
}

export async function handleResearchSalesFlow(input: {
  phone: string;
  text: string;
  source: "whatsapp" | "simulator";
}): Promise<ResearchSalesFlowResult | null> {
  if (isExplicitResearchHumanRequest(input.text)) return null;

  let lead = await getOrCreateLead(input.phone, input.source);
  const history = await getConversation(input.phone, 48).catch(() => []);
  lead = await repairLegacyPrematureHandoff(input.phone, lead, history);

  if (["CONVERTED", "LOST LEAD"].includes(lead.status)) return null;
  if (lead.status === "HUMAN ASSISTANCE REQUIRED") return null;

  const clientMessages = history.filter((message) => message.role === "user").map((message) => message.content);
  if (!clientMessages.length || clientMessages.at(-1)?.trim() !== input.text.trim()) clientMessages.push(input.text);
  if (!isResearchPreSaleContext(clientMessages, lead.serviceInterest || lead.packageName)) return null;

  const clientTranscript = clientMessages.join("\n");
  const exactService = inferResearchCatalogueService(clientTranscript, lead.serviceInterest || lead.packageName);
  const programme = inferProgramme(clientMessages, lead.programme);
  const deadline = inferResearchDeadline(clientMessages, lead.deadline);
  const nextQuestion = researchQualificationQuestion(exactService, programme, deadline);

  const patch: Record<string, unknown> = {};
  const currentService = String(lead.serviceInterest || "").trim();
  if (exactService !== "Research support" && currentService !== exactService) patch.serviceInterest = exactService;
  else if (!currentService) patch.serviceInterest = exactService;
  if (!lead.programme && programme) patch.programme = programme;
  if (!lead.deadline && deadline) patch.deadline = deadline;
  if (lead.status === "NEW LEAD" && !nextQuestion) patch.status = "QUALIFIED";
  if (Object.keys(patch).length) lead = await updateLead(input.phone, patch as any).catch(() => lead);

  if (nextQuestion) {
    await addMessage(input.phone, "assistant", nextQuestion);
    return { reply: nextQuestion, referralNotification: null, documentIds: [] };
  }

  if (!researchSalesHasCommercialIntent(clientTranscript)) {
    const reply = `I have the key details for your ${exactService.toLowerCase()}. Would you like me to prepare the MedMinds quotation now?`;
    await addMessage(input.phone, "assistant", reply);
    return { reply, referralNotification: null, documentIds: [] };
  }

  const offers = await listOffers(true);
  const pricing = resolveCataloguePrice(offers, { service: exactService, programme, deadline });

  if (pricing.status === "ambiguous") {
    const reply = `I have the main details, but I want to match the quotation correctly. Is the support for ${pricing.candidates.slice(0, 3).map((offer) => offer.name).join(", ")}, or another research service?`;
    await addMessage(input.phone, "assistant", reply);
    return { reply, referralNotification: null, documentIds: [] };
  }

  if (pricing.status === "not_found") {
    const reply = "I have your research-support details, but I still need the exact deliverable before I can select the approved price. Which specific part should MedMinds handle?";
    await addMessage(input.phone, "assistant", reply);
    return { reply, referralNotification: null, documentIds: [] };
  }

  if (pricing.status === "custom") {
    const reply = `${pricing.offer.name} needs a tailored quotation rather than a fixed catalogue amount. I’ll keep the sales request here for price confirmation instead of sending you an estimated figure.`;
    await updateLead(input.phone, { serviceInterest: pricing.offer.name, status: "INTERESTED" }).catch(() => undefined);
    await addMessage(input.phone, "assistant", reply);
    return { reply, referralNotification: null, documentIds: [] };
  }

  const existing = await getLatestPreparedQuotation(lead.id).catch(() => null);
  if (existing && existing.service === pricing.offer.name && Number(existing.amount_zmw || 0) === Number(pricing.amountZmw)) {
    await updateLead(input.phone, { serviceInterest: pricing.offer.name, status: "INTERESTED", ...(deadline ? { deadline } : {}) }).catch(() => undefined);
    const reply = `The approved fee for ${pricing.offer.name} is K${pricing.amountZmw.toLocaleString()}. Your quotation is already prepared. Reply “send my quotation” and I’ll send the PDF here.`;
    await addMessage(input.phone, "assistant", reply);
    return { reply, referralNotification: null, documentIds: [] };
  }

  const details = [
    pricing.offer.name,
    programme ? `Programme/level: ${programme}` : null,
    deadline ? `Client deadline: ${deadline}` : null,
    `Pricing basis: ${pricing.priceType === "rush" ? "approved rush price" : "approved standard price"}`
  ].filter(Boolean).join(" · ");

  const quote = await createQuote({ leadId: lead.id, service: pricing.offer.name, amountZmw: pricing.amountZmw, details, status: "QUOTATION" }) as any;
  lead = await updateLead(input.phone, { serviceInterest: pricing.offer.name, status: "INTERESTED", ...(deadline ? { deadline } : {}) }).catch(() => lead);

  void notifyBusinessEvent({
    type: "quote_created",
    eventKey: `quote_created:${String(quote.id)}`,
    title: "New MedMinds research quotation",
    body: `Service: ${pricing.offer.name}\nAmount: K${pricing.amountZmw.toLocaleString()}\nPricing: ${pricing.priceType}\n${details}`,
    lead
  }).catch(() => undefined);

  const amount = `K${pricing.amountZmw.toLocaleString()}`;
  let reply: string;
  if (input.source === "whatsapp") {
    try {
      const delivered = await sendCommercialPdf({ lead, record: quote });
      reply = `The approved fee for ${pricing.offer.name} is ${amount}. I’ve prepared and sent quotation ${delivered.documentNumber}. Please review it, and if you’re happy with it I’ll guide you to the next step.`;
    } catch (error) {
      console.error("Research sales quotation PDF delivery failed", { phoneSuffix: input.phone.slice(-4), quoteId: quote.id, error });
      reply = `The approved fee for ${pricing.offer.name} is ${amount}, and your quotation has been prepared. The PDF did not attach just now; reply “send my quotation” and I’ll retry it.`;
    }
  } else {
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://sales.medmindslc.online").replace(/\/$/, "");
    reply = `The approved fee for ${pricing.offer.name} is ${amount}. I’ve prepared your quotation here: ${base}/api/documents/${quote.id}. Please review it and let me know if you would like to proceed.`;
  }

  await addMessage(input.phone, "assistant", reply);
  return { reply, referralNotification: null, documentIds: [] };
}