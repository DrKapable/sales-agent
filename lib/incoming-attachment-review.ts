import { parseClientAttachmentChatContent, type ClientAttachmentPayload } from "@/lib/client-attachment-content";
import type { ConversationMessage, Lead } from "@/lib/types";

export type AttachmentReviewKind = "payment_proof" | "general_review";

export type AttachmentReview = {
  kind: AttachmentReviewKind;
  attachment: ClientAttachmentPayload;
  acknowledgement: string;
  handoffReason: string;
  assignedTo: string;
  status: Lead["status"];
};

const PAYMENT_CONTEXT = /\b(payment|paid|paying|proof|receipt|transaction|airtel\s*money|mtn\s*money|deposit|transfer|course\s*fee|fee|activate|activation|amount|k\s?\d{2,})\b/i;
const APPROVAL_CONTEXT = /\b(approve|approval|review|verify|verification|confirm|confirmation|check|proof|receipt)\b/i;

function recentText(history: ConversationMessage[], lead: Lead, attachment: ClientAttachmentPayload) {
  return [
    attachment.caption,
    lead.serviceInterest,
    lead.packageName,
    lead.status,
    ...history.slice(-10).map((message) => message.content)
  ].filter(Boolean).join("\n");
}

export function classifyIncomingAttachmentForReview(input: {
  content: string;
  history: ConversationMessage[];
  lead: Lead;
}): AttachmentReview | null {
  const attachment = parseClientAttachmentChatContent(input.content);
  if (!attachment || !["image", "document"].includes(attachment.kind)) return null;

  const context = recentText(input.history, input.lead, attachment);
  const isPaymentProof = PAYMENT_CONTEXT.test(context);

  if (isPaymentProof) {
    return {
      kind: "payment_proof",
      attachment,
      acknowledgement: "Thank you. I have received your proof of payment and forwarded it to our team for verification. Please also send the email address you want linked to your account if you have not already done so. We will confirm here once the payment has been verified.",
      handoffReason: "Payment proof received from client and awaiting independent human verification.",
      assignedTo: "Dr. Mustafa Juma Phiri",
      status: "PAYMENT PENDING"
    };
  }

  const approvalRequested = APPROVAL_CONTEXT.test(context);
  return {
    kind: "general_review",
    attachment,
    acknowledgement: approvalRequested
      ? "Thank you. I have received the attachment and forwarded it to our team for review and approval. A team member will check it and respond here."
      : "Thank you. I have received the attachment and forwarded it to our team for human review. A team member will check it and respond here.",
    handoffReason: approvalRequested
      ? "Client attachment received and awaiting human review or approval."
      : "Client attachment received and awaiting human review.",
    assignedTo: "Dr Kanyembo Ng'andwe",
    status: "HUMAN ASSISTANCE REQUIRED"
  };
}

export function buildAttachmentReviewNotification(input: {
  lead: Lead;
  review: AttachmentReview;
}) {
  const { lead, review } = input;
  const contact = lead.phone.startsWith("+") ? lead.phone : `+${lead.phone}`;
  const label = review.kind === "payment_proof" ? "PAYMENT PROOF REQUIRES VERIFICATION" : "CLIENT ATTACHMENT REQUIRES REVIEW";
  return [
    label,
    `Client: ${lead.name || "Not provided"}`,
    `Phone: ${contact}`,
    `Service: ${lead.serviceInterest || lead.packageName || "Not established"}`,
    `File: ${review.attachment.fileName || review.attachment.kind}`,
    review.attachment.caption ? `Caption: ${review.attachment.caption}` : null,
    review.kind === "payment_proof"
      ? "Action: independently verify the payment before activating access or marking the client as paid."
      : "Action: review the attached file and respond to the client in the admin chat.",
    "The original attachment is forwarded separately below."
  ].filter(Boolean).join("\n");
}
