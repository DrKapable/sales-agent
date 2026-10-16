import { describe, expect, it } from "vitest";
import { deliveryLabel, isStaffCorrespondenceInquiry, staffReceiptMilestone } from "@/lib/internal-team-correspondence";
import { parseIncomingMessages } from "@/lib/whatsapp";

describe("Mary staff delivery/reply queries", () => {
  it.each([
    "Confirm delivery and let me know what he replies. And also update me on what Kanyembo has said",
    "Has Conrad replied?",
    "Did Kanyembo read the message?",
    "What did Kanyembo say?",
    "Any response from Conrad?",
    "Who has responded?",
    "What's the delivery status?",
    "Show me the staff replies",
    "Check their replies"
  ])("routes %s to actual receipt/inbound staff records", text => {
    expect(isStaffCorrespondenceInquiry(text)).toBe(true);
  });
  it.each([
    "Send Conrad a message about the new leads",
    "Remind Kanyembo to address the inbox",
    "Assign Conrad to a client",
    "Message Zabibu",
    "Confirm A1B2C3D4",
    "What did I miss today?"
  ])("does not mistake action or general question %s for a delivery query", text => {
    expect(isStaffCorrespondenceInquiry(text)).toBe(false);
  });
});

describe("verified WhatsApp status labels", () => {
  it("never calls API acceptance delivered", () => {
    expect(deliveryLabel([], "ACCEPTED")).toContain("delivery not yet confirmed");
    expect(deliveryLabel(["ACCEPTED"], "ACCEPTED")).toContain("awaiting further");
  });
  it("handles sent, delivered, read and failed correctly", () => {
    expect(deliveryLabel(["SENT"], "ACCEPTED")).toBe("Sent");
    expect(deliveryLabel(["DELIVERED"], "ACCEPTED")).toContain("Delivered");
    expect(deliveryLabel(["READ"], "ACCEPTED")).toBe("Read");
    expect(deliveryLabel(["SENT","READ"], "ACCEPTED")).toContain("Sent");
    expect(deliveryLabel(["FAILED"], "ACCEPTED")).toContain("Failed");
  });
  it("preserves submission uncertainty instead of claiming success", () => {
    expect(deliveryLabel([], "UNCERTAIN")).toBe("Submission unverified");
  });
});

describe("Meta WhatsApp reply context", () => {
  it("preserves explicit reply-to message id to correlate actual staff replies", () => {
    const parsed = parseIncomingMessages({
      entry:[{changes:[{value:{
        metadata:{phone_number_id:"12345"},
        contacts:[{profile:{name:"Staff colleague"}}],
        messages:[{id:"wamid.reply.1",from:"260974634555",type:"text",
          text:{body:"I have addressed the issue."},context:{id:"wamid.original.1"}}]
      }}]}]
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].replyToMessageId).toBe("wamid.original.1");
    expect(parsed[0].text).toBe("I have addressed the issue.");
  });
  it("does not invent a reply-to ID on ordinary inbound messages", () => {
    const parsed = parseIncomingMessages({
      entry:[{changes:[{value:{messages:[{
        id:"wamid.reply.2",from:"260974634555",type:"text",text:{body:"Hello Mary"}
      }]}}]}]
    });
    expect(parsed[0].replyToMessageId).toBeUndefined();
  });
});

describe("deduplicated staff delivery milestones", () => {
  it("does not alert delivered while any message part is only sent or accepted", () => {
    expect(staffReceiptMilestone(["SENT"])).toBeNull();
    expect(staffReceiptMilestone(["DELIVERED", "SENT"])).toBeNull();
    expect(staffReceiptMilestone(["READ", "ACCEPTED"])).toBeNull();
    expect(staffReceiptMilestone([])).toBeNull();
  });
  it("waits for all parts and handles provider failure", () => {
    expect(staffReceiptMilestone(["DELIVERED","DELIVERED"])).toBe("DELIVERED");
    expect(staffReceiptMilestone(["READ","DELIVERED"])).toBe("DELIVERED");
    expect(staffReceiptMilestone(["READ","READ"])).toBe("READ");
    expect(staffReceiptMilestone(["READ","FAILED"])).toBe("FAILED");
  });
});
