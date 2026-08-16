import { buildReferralMessage, referralRecipients } from "@/lib/referrals";
import { getOrCreateLead, updateLead } from "@/lib/store";

export type ResearchServiceEscalationResult = {
  reply: string;
  referralNotification: { phone: string; recipientName: string; body: string } | null;
  documentIds: string[];
};

const COURSE_WORDS = /\b(course|training|class|lesson|module|certificate|enrol|enroll|self[- ]?paced|learn how|teach me|ai-assisted research proposal writing)\b/i;
const COMMERCIAL_RESEARCH_INTENT = /\b(price|prices|pricing|cost|costs|charge|charges|fee|fees|how much|quotation|quote|invoice|receipt|package|packages|pay|payment|proceed|start|book|order|hire|service|services)\b/i;
const RESEARCH_DELIVERABLE = /\b(research topic|topic development|proposal|dissertation|thesis|literature review|methodology|research design|protocol|concept note|questionnaire|data collection tool|sample size|data analysis|statistical analysis|qualitative analysis|thematic analysis|chapter\s*[1-6]|results chapter|discussion chapter|proofread(?:ing)?|editing|referenc(?:e|es|ing))\b/i;
const DIRECT_RESEARCH_ACTION = /\b(write|develop|prepare|do|analyse|analyze|review|edit|proofread|calculate|create|make|draft|generate)\b.{0,55}\b(research|topic|proposal|dissertation|thesis|methodology|literature|sample|data|chapter|questionnaire|protocol|concept note)\b/i;
const DIRECT_RESEARCH_HELP = /\b(help|assist)\b.{0,55}\b(research topic|topic|proposal|dissertation|thesis|literature review|methodology|research design|protocol|concept note|questionnaire|sample size|data analysis|statistical analysis|qualitative analysis|chapter|results|discussion)\b/i;
const SPECIALIST_RESEARCH = /\b(advanced|complex|specialist|research design|methodology|protocol|sample size|power calculation|multivariable|multivariate|regression|survival analysis|cox regression|multilevel|mixed effects|systematic review|meta-analysis|publication|journal|statistical model|clinical research)\b/i;

/**
 * Returns true only when the client is asking Mary herself to perform research work.
 * Commercial research enquiries (prices, quotations, invoices, payment, packages or
 * starting a service) deliberately remain with Mary because she is the sales agent.
 */
export function isResearchServiceRequest(text: string) {
  const clean = text.trim();
  if (!clean || COURSE_WORDS.test(clean)) return false;
  if (COMMERCIAL_RESEARCH_INTENT.test(clean)) return false;
  if (DIRECT_RESEARCH_ACTION.test(clean)) return true;
  return RESEARCH_DELIVERABLE.test(clean) && DIRECT_RESEARCH_HELP.test(clean);
}

function specialistRequest(text: string) {
  return SPECIALIST_RESEARCH.test(text);
}

export async function maybeEscalateResearchService(input: {
  phone: string;
  text: string;
  source: "whatsapp" | "simulator";
}): Promise<ResearchServiceEscalationResult | null> {
  if (!isResearchServiceRequest(input.text)) return null;

  const currentLead = await getOrCreateLead(input.phone, input.source);
  const specialist = specialistRequest(input.text);
  const recipient = specialist ? referralRecipients.mustafa : referralRecipients.monica;
  const reason = specialist
    ? "Client asked Mary to perform specialist research work. Mary may sell and coordinate research services but must not personally produce the research deliverable."
    : "Client asked Mary to perform hands-on research work. Mary may sell and coordinate research services but must not personally produce the research deliverable.";
  const summary = `Client request: ${input.text.trim().slice(0, 700)}`;
  const alreadyAssigned = currentLead.status === "HUMAN ASSISTANCE REQUIRED" && currentLead.assignedTo === recipient.name;

  const savedLead = await updateLead(input.phone, {
    serviceInterest: currentLead.serviceInterest || "Research support",
    status: "HUMAN ASSISTANCE REQUIRED",
    handoffReason: reason,
    assignedTo: recipient.name,
    aiPaused: false
  });

  const referralNotification = !alreadyAssigned && recipient.phone
    ? {
        phone: recipient.phone,
        recipientName: recipient.name,
        body: buildReferralMessage({ recipientName: recipient.name, lead: savedLead, reason, summary })
      }
    : null;

  const reply = specialist
    ? `I can help you with the MedMinds service, pricing and arrangements, but I can't personally perform that specialist research work. I've referred the research work to ${recipient.name} for the technical review.`
    : `I can help you with the MedMinds research service, pricing and arrangements, but I can't personally develop or write the research work. I've referred the research work to ${recipient.name}, our research-support expert.`;

  return { reply, referralNotification, documentIds: [] };
}
