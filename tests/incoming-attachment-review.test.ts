import { describe, expect, it } from "vitest";
import { clientAttachmentChatContent } from "@/lib/client-attachment-content";
import { classifyIncomingAttachmentForReview } from "@/lib/incoming-attachment-review";
import type { ConversationMessage, Lead } from "@/lib/types";

const lead: Lead = {
  id: "lead-1",
  phone: "260761044126",
  name: "Intelli Dine Solutions",
  email: null,
  institution: null,
  programme: null,
  serviceInterest: "AI-Assisted Research Proposal Writing",
  deadline: null,
  packageName: null,
  status: "INTERESTED",
  handoffReason: null,
  aiPaused: false,
  assignedTo: null,
  internalNote: null,
  priority: "HOT",
  followUpAt: null,
  source: "whatsapp",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastMessageAt: null
};

function history(content: string): ConversationMessage[] {
  return [{ id: "m1", externalId: null, phone: lead.phone, role: "assistant", content, createdAt: new Date().toISOString() }];
}

describe("incoming attachment review", () => {
  it("routes an image sent after payment instructions as payment proof", () => {
    const content = clientAttachmentChatContent({ kind: "image", mediaId: "media12345", fileName: "proof.jpg", mimeType: "image/jpeg", caption: null });
    const review = classifyIncomingAttachmentForReview({ content, lead, history: history("The course fee is K350. After payment, please send proof of payment.") });
    expect(review?.kind).toBe("payment_proof");
    expect(review?.status).toBe("PAYMENT PENDING");
    expect(review?.assignedTo).toBe("Dr. Mustafa Juma Phiri");
    expect(review?.acknowledgement).toContain("received your proof of payment");
  });

  it("routes an unrelated image to general human review", () => {
    const content = clientAttachmentChatContent({ kind: "image", mediaId: "media67890", fileName: "requirements.jpg", mimeType: "image/jpeg", caption: null });
    const review = classifyIncomingAttachmentForReview({ content, lead: { ...lead, serviceInterest: "Website design" }, history: history("Please send the screenshot you want us to check.") });
    expect(review?.kind).toBe("general_review");
    expect(review?.status).toBe("HUMAN ASSISTANCE REQUIRED");
    expect(review?.assignedTo).toBe("Dr Kanyembo Ng'andwe");
  });

  it("does not divert audio into the image review flow", () => {
    const content = clientAttachmentChatContent({ kind: "audio", mediaId: "audio12345", fileName: "voice.ogg", mimeType: "audio/ogg", caption: null });
    expect(classifyIncomingAttachmentForReview({ content, lead, history: [] })).toBeNull();
  });
});
