import type { Lead } from "@/lib/types";

export const FOLLOW_UP_STEPS = 4;

export type FollowUpAngle = "goal" | "reduce_uncertainty" | "deadline_or_value" | "final_autonomy";

export function followUpDelayHours(lead: Pick<Lead, "status" | "priority">, step: number) {
  if (step === 0) return lead.status === "PAYMENT PENDING" || lead.priority === "HOT" ? 8 : 12;
  if (step === 1) return 72;
  if (step === 2) return 168;
  if (step === 3) return 336;
  return null;
}

export function followUpAngle(step: number): FollowUpAngle {
  if (step === 0) return "goal";
  if (step === 1) return "reduce_uncertainty";
  if (step === 2) return "deadline_or_value";
  return "final_autonomy";
}

function firstName(value: string | null) {
  return value?.trim().split(/\s+/)[0] || null;
}

function serviceLabel(lead: Pick<Lead, "serviceInterest" | "packageName">) {
  return lead.serviceInterest || lead.packageName || "your MedMinds enquiry";
}

/** Safe fallback copy if AI generation is unavailable. It deliberately uses
 * the client's existing goal and one low-friction next step rather than a
 * generic "just checking in" message. */
export function buildFollowUpFallback(lead: Pick<Lead, "name" | "serviceInterest" | "packageName" | "deadline" | "status">, step: number) {
  const name = firstName(lead.name);
  const hello = name ? `Hi ${name},` : "Hi,";
  const service = serviceLabel(lead);

  if (step === 0) {
    if (lead.status === "PAYMENT PENDING") {
      return `${hello} you were at the payment step for ${service}. If anything blocked you, I can help you pick up from there. Were you able to complete the payment?`;
    }
    return `${hello} you were looking into ${service}. If that is still something you want to move forward with, I can continue from where we stopped. Are you still working on it?`;
  }

  if (step === 1) {
    return `${hello} I’m following up on ${service}. If price, trust, or the next step is what is holding things up, tell me the one concern and I’ll address it directly.`;
  }

  if (step === 2) {
    if (lead.deadline) {
      return `${hello} you mentioned a deadline around ${lead.deadline} for ${service}. If that deadline still applies, we can focus only on the next practical step. Would you like to continue?`;
    }
    return `${hello} a quick check on ${service}. If it is still relevant, I can help you choose the simplest next step without going through everything again. Would you like to continue?`;
  }

  return `${hello} I’ll close the loop on ${service} for now so I don’t keep messaging you. If you decide to continue later, just reply here and we’ll pick up from where we stopped.`;
}

export function leadFollowUpRank(lead: Pick<Lead, "status" | "priority">) {
  const priority = lead.priority === "HOT" ? 30 : lead.priority === "WARM" ? 20 : 10;
  const status = lead.status === "PAYMENT PENDING" ? 40 : lead.status === "INTERESTED" ? 30 : lead.status === "QUALIFIED" ? 20 : lead.status === "FOLLOW-UP REQUIRED" ? 15 : 10;
  return priority + status;
}
