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
 * Classifies requests where Mary is being asked to personally perform substantive research work.
 * Commercial research enquiries remain with Mary because she is the sales agent.
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

  // Research-service intent is a sales opportunity first. Mary must qualify the
  // client, establish the exact service, quote from the catalogue and move the
  // lead through payment/conversion before routine fulfilment is handed over.
  // Explicit human/specialist requests can still be handled by the agent's
  // normal human-assistance tool before conversion.
  if (currentLead.status !== "CONVERTED") return null;

  const specialist = specialistRequest(input.text);
  const recipient = specialist ? referralRecipients.mustafa : referralRecipients.monica;
  const reason = specialist
    ? "Converted client requested specialist research fulfilment."
    : "Converted client requested hands-on research fulfilment.";
  const summary = `Client request: ${input.text.trim().slice(0, 700)}`;

  const savedLead = await updateLead(input.phone, {
    serviceInterest: currentLead.serviceInterest || "Research support",
    status: "HUMAN ASSISTANCE REQUIRED",
    handoffReason: reason,
    assignedTo: recipient.name,
    aiPaused: false
  });

  const referralNotification = recipient.phone
    ? {
        phone: recipient.phone,
        recipientName: recipient.name,
        body: buildReferralMessage({ recipientName: recipient.name, lead: savedLead, reason, summary })
      }
    : null;

  const reply = specialist
    ? `Your MedMinds research service is already in the fulfilment stage. I've referred this specialist part to ${recipient.name} for technical review.`
    : `Your MedMinds research service is already in the fulfilment stage. I've referred this research work to ${recipient.name}, our research-support expert.`;

  return { reply, referralNotification, documentIds: [] };
}
