import { buildReferralMessage, referralRecipients } from "@/lib/referrals";
import { getOrCreateLead, updateLead } from "@/lib/store";

export type ResearchServiceEscalationResult = {
  reply: string;
  referralNotification: { phone: string; recipientName: string; body: string } | null;
  documentIds: string[];
};

const COURSE_WORDS = /\b(course|training|class|lesson|module|certificate|enrol|enroll|self[- ]?paced|learn how|teach me|ai-assisted research proposal writing)\b/i;
const GENERAL_RESEARCH_SERVICE = /\b(research support|research service|research assistance|research help)\b/i;
const RESEARCH_DELIVERABLE = /\b(research topic|topic development|proposal|dissertation|thesis|literature review|methodology|research design|protocol|concept note|questionnaire|data collection tool|sample size|data analysis|statistical analysis|qualitative analysis|thematic analysis|chapter\s*[1-6]|results chapter|discussion chapter|proofread(?:ing)?|editing|referenc(?:e|es|ing))\b/i;
const SERVICE_INTENT = /\b(need|want|looking for|help|assist|support|service|write|develop|prepare|do|analyse|analyze|review|edit|proofread|price|cost|charge|how much|quotation|quote|can you|could you|would you)\b/i;
const DIRECT_RESEARCH_ACTION = /\b(write|develop|prepare|do|analyse|analyze|review|edit|proofread|calculate|create|make)\b.{0,45}\b(research|topic|proposal|dissertation|thesis|methodology|literature|sample|data|chapter|questionnaire|protocol)\b/i;
const SPECIALIST_RESEARCH = /\b(advanced|complex|specialist|research design|methodology|protocol|sample size|power calculation|multivariable|multivariate|regression|survival analysis|cox regression|multilevel|mixed effects|systematic review|meta-analysis|publication|journal|statistical model|clinical research)\b/i;

export function isResearchServiceRequest(text: string) {
  const clean = text.trim();
  if (!clean || COURSE_WORDS.test(clean)) return false;
  if (GENERAL_RESEARCH_SERVICE.test(clean)) return true;
  if (DIRECT_RESEARCH_ACTION.test(clean)) return true;
  return RESEARCH_DELIVERABLE.test(clean) && SERVICE_INTENT.test(clean);
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
    ? "Client requires specialist research support. Mary is not authorised to scope or provide hands-on research services."
    : "Client requires hands-on research support. Mary is not authorised to scope or provide research services.";
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
    ? `This needs review by our research specialist rather than being handled directly by me. I've referred your request to ${recipient.name}. They can assess the research requirements and advise you appropriately.`
    : `For hands-on research support, I need to refer you to our research team rather than offer or develop the work myself. I've referred your request to ${recipient.name}, our research-support expert, who can assess what you need and guide you from there.`;

  return { reply, referralNotification, documentIds: [] };
}
