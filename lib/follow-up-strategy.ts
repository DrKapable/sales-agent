import { classifySalesTurn, type SalesTurnAnalysis } from "@/lib/conversation-optimization";
import type { Lead } from "@/lib/types";

export type FollowUpFrame = "relevance" | "commitment" | "friction" | "credibility" | "autonomy";

export type FollowUpStrategy = {
  cadenceHours: readonly number[];
  frame: FollowUpFrame;
  message: string;
  analysis: SalesTurnAnalysis;
};

const HOUR_MS = 60 * 60 * 1000;

function firstName(lead: Pick<Lead, "name">) {
  return lead.name?.trim().split(/\s+/)[0] || null;
}

function serviceLabel(lead: Pick<Lead, "serviceInterest" | "packageName">) {
  const value = (lead.serviceInterest || lead.packageName || "").trim();
  if (!value || /research enquiry|service not established/i.test(value)) return "research support";
  if (/ai[- ]?(?:assisted|enhanced).*proposal|proposal writing course/i.test(value)) return "the K350 AI-Assisted Proposal Writing course";
  return value;
}

function isCourse(lead: Pick<Lead, "serviceInterest" | "packageName">) {
  return /ai[- ]?(?:assisted|enhanced).*proposal|proposal writing course/i.test(`${lead.serviceInterest || ""} ${lead.packageName || ""}`);
}

function intro(lead: Pick<Lead, "name">) {
  const name = firstName(lead);
  return name ? `Hi ${name},` : "Hi,";
}

export function followUpCadenceHours(lead: Pick<Lead, "priority" | "status">): readonly number[] {
  if (lead.priority === "HOT" || lead.status === "PAYMENT PENDING") return [6, 18, 72, 168, 336] as const;
  if (lead.priority === "WARM" || lead.status === "INTERESTED" || lead.status === "QUALIFIED") return [14, 72, 168, 336, 504] as const;
  return [18, 96, 240, 504] as const;
}

export function nextFollowUpDue(input: {
  lead: Pick<Lead, "priority" | "status" | "followUpAt">;
  anchorUserAt: string;
  step: number;
  lastSentAt: string | null;
}) {
  const cadence = followUpCadenceHours(input.lead);
  if (input.step >= cadence.length) return null;

  let due: Date;
  if (input.step === 0 || !input.lastSentAt) {
    due = new Date(new Date(input.anchorUserAt).getTime() + cadence[input.step] * HOUR_MS);
  } else {
    const previousOffset = cadence[input.step - 1] ?? 0;
    const intervalHours = Math.max(1, cadence[input.step] - previousOffset);
    due = new Date(new Date(input.lastSentAt).getTime() + intervalHours * HOUR_MS);
  }

  // A timing objection or an administrator-scheduled follow-up should never be
  // pulled earlier by the automated cadence. The later date wins.
  if (input.lead.status === "FOLLOW-UP REQUIRED" && input.lead.followUpAt) {
    const explicit = new Date(input.lead.followUpAt);
    if (Number.isFinite(explicit.getTime()) && explicit.getTime() > due.getTime()) due = explicit;
  }
  return due;
}

function frameFor(step: number, totalSteps: number): FollowUpFrame {
  if (step >= totalSteps - 1) return "autonomy";
  if (step === 0) return "relevance";
  if (step === 1) return "commitment";
  if (step === 2) return "friction";
  return "credibility";
}

function deadlinePhrase(lead: Pick<Lead, "deadline">) {
  return lead.deadline?.trim() ? ` before ${lead.deadline.trim()}` : "";
}

export function buildConversionFollowUp(input: {
  lead: Pick<Lead, "name" | "serviceInterest" | "packageName" | "deadline" | "priority" | "status">;
  step: number;
  lastUserText: string;
}): FollowUpStrategy {
  const cadenceHours = followUpCadenceHours(input.lead);
  const frame = frameFor(input.step, cadenceHours.length);
  const analysis = classifySalesTurn(input.lastUserText, input.lead);
  const hello = intro(input.lead);
  const service = serviceLabel(input.lead);
  const course = isCourse(input.lead);
  let message: string;

  if (frame === "autonomy") {
    message = `${hello} I’ll close this follow-up for now so I don’t keep messaging you about ${service}. If you want to continue later, reply here and I’ll pick up from where we left off.`;
  } else if (input.lead.status === "PAYMENT PENDING" || analysis.paymentIntent || analysis.proceedIntent) {
    message = `${hello} you were close to moving ahead with ${service}. If the payment step is the only thing left, I can help you complete it here. Would you like the payment details again?`;
  } else if (analysis.objection === "price") {
    message = `${hello} you were considering ${service}, and cost seemed to be the main concern. I can help you review the approved option and payment structure without adding anything you don’t need. Would a formal quotation help?`;
  } else if (analysis.objection === "trust") {
    message = `${hello} you were considering ${service}. If you want to verify MedMinds before deciding, I can provide an official quotation and verified MedMinds details. Would you like that?`;
  } else if (analysis.objection === "timing" && frame === "relevance") {
    message = `${hello} you mentioned you wanted some time before deciding about ${service}. I’m checking in now without any pressure. Are you still considering it?`;
  } else if (frame === "relevance") {
    if (course) {
      message = `${hello} you were looking at ${service}. If learning the proposal-writing process yourself is still your goal, I can help you enrol. Would you like the payment details?`;
    } else {
      message = `${hello} you reached out about ${service} earlier. If you still want help moving your proposal, dissertation or data analysis forward, I can pick up from where we stopped. Are you still looking for support?`;
    }
  } else if (frame === "commitment") {
    message = `${hello} when you contacted us, you were looking for help with ${service}. Are you still aiming to get that sorted${deadlinePhrase(input.lead)}?`;
  } else if (frame === "friction") {
    message = `${hello} if ${service} is still on your list, I can make the next step simple. I can clarify the price/process or prepare the formal quotation. Which would be more useful?`;
  } else {
    message = `${hello} if you’re still considering ${service}, I can prepare a formal MedMinds quotation so you can review the service and approved cost clearly before deciding. Would you like me to prepare it?`;
  }

  return { cadenceHours, frame, message, analysis };
}

export function followUpPriorityRank(lead: Pick<Lead, "priority" | "status">) {
  if (lead.status === "PAYMENT PENDING") return 500;
  if (lead.priority === "HOT") return 400;
  if (lead.status === "INTERESTED") return 300;
  if (lead.priority === "WARM" || lead.status === "QUALIFIED") return 200;
  if (lead.status === "FOLLOW-UP REQUIRED") return 150;
  return 100;
}

export function shouldThrottleFollowUpRetry(lastResult: string | null, lastAttemptAt: string | null, now = Date.now()) {
  if (!lastAttemptAt || !lastResult) return false;
  if (!/template_required|send_failed/.test(lastResult)) return false;
  const age = now - new Date(lastAttemptAt).getTime();
  if (!Number.isFinite(age)) return false;
  const waitHours = lastResult === "template_required" ? 12 : 6;
  return age < waitHours * HOUR_MS;
}
