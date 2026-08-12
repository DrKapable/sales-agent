import { NextResponse } from "next/server";
import { z } from "zod";
import { createBusinessTask, createQuote, getBusinessSnapshot, recordFeedback, recordPayment, updateBusinessTask, verifyPayment } from "@/lib/business-ops";
import { addMessage, getConversation, listLeads } from "@/lib/store";
import { MEDMINDS_REVIEW_COLLECTION_URL } from "@/lib/reputation";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendNamedWhatsAppTemplate } from "@/lib/whatsapp-template";
import { notifyBusinessEvent } from "@/lib/business-notifications";
import { sendBrandedReceiptPdf } from "@/lib/receipt-delivery";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("task"), leadId: z.string().optional(), title: z.string().min(2).max(240), assignedTo: z.string().max(160).optional(), dueAt: z.string().datetime().optional(), notes: z.string().max(1200).optional() }),
  z.object({ action: z.literal("task_status"), taskId: z.string().uuid(), status: z.enum(["OPEN", "COMPLETED"]) }),
  z.object({ action: z.literal("payment"), leadId: z.string().min(1), amountZmw: z.number().positive(), reference: z.string().max(160).optional(), verified: z.boolean().optional(), verifiedBy: z.string().max(160).optional() }),
  z.object({ action: z.literal("verify_payment"), paymentId: z.string().uuid(), verifiedBy: z.string().max(160).optional() }),
  z.object({ action: z.literal("send_receipt"), paymentId: z.string().uuid() }),
  z.object({ action: z.literal("quote"), leadId: z.string().min(1), service: z.string().min(2).max(240), amountZmw: z.number().nonnegative().optional(), details: z.string().min(3).max(1800) }),
  z.object({ action: z.literal("feedback"), leadId: z.string().min(1), rating: z.number().int().min(1).max(5).optional(), comment: z.string().max(1200).optional(), reviewRequested: z.boolean().optional() }),
  z.object({ action: z.literal("review_request"), leadId: z.string().min(1) })
]);

export async function GET() {
  try {
    const snapshot = await getBusinessSnapshot();
    return NextResponse.json({
      ...snapshot,
      capabilities: {
        persistentDatabase: Boolean(process.env.DATABASE_URL),
        whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
        researchPortal: Boolean(process.env.RESEARCH_ASSISTANT_SECRET && (process.env.RESEARCH_PORTAL_TASK_URL || true)),
        reviewOutside24h: Boolean(process.env.WHATSAPP_REVIEW_TEMPLATE_NAME),
        scheduledAutomation: true
      }
    });
  } catch (error) {
    console.error("Business snapshot failed", { error });
    return NextResponse.json({ error: "Unable to load business intelligence." }, { status: 500 });
  }
}

async function leadById(leadId?: string | null) {
  return leadId ? (await listLeads()).find((item) => item.id === leadId) || null : null;
}

async function trySendReceipt(lead: Awaited<ReturnType<typeof leadById>>, payment: any) {
  if (!lead) return { receiptSent: false, receiptError: "Client not found." };
  try {
    const receipt = await sendBrandedReceiptPdf({ lead, payment });
    return { receiptSent: true, receipt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt could not be sent.";
    console.error("Branded PDF receipt delivery failed", { paymentId: payment?.id, phoneSuffix: lead.phone.slice(-4), error });
    return { receiptSent: false, receiptError: message };
  }
}

async function sendReviewRequest(leadId: string) {
  const lead = await leadById(leadId);
  if (!lead) throw new Error("Client not found.");
  const history = await getConversation(lead.phone, 30);
  const lastUser = [...history].reverse().find((message) => message.role === "user");
  const within24h = Boolean(lastUser && Date.now() - new Date(lastUser.createdAt).getTime() < 24 * 60 * 60 * 1000);
  const firstName = lead.name?.split(/\s+/)[0];
  const message = `${firstName ? `Hi ${firstName}, ` : "Hi, "}thank you for choosing MedMinds. If you have a moment, we’d appreciate an honest Google review about your experience: ${MEDMINDS_REVIEW_COLLECTION_URL}`;
  if (within24h) {
    await sendWhatsAppText(lead.phone, message);
    await addMessage(lead.phone, "assistant", `[Review request] ${message}`);
  } else {
    const template = process.env.WHATSAPP_REVIEW_TEMPLATE_NAME;
    if (!template) throw new Error("The 24-hour WhatsApp window is closed. Configure WHATSAPP_REVIEW_TEMPLATE_NAME with an approved Meta review template.");
    await sendNamedWhatsAppTemplate(lead.phone, template, process.env.WHATSAPP_REVIEW_TEMPLATE_LANGUAGE || "en_US");
    await addMessage(lead.phone, "assistant", `[Review request sent using approved WhatsApp template: ${template}]`);
  }
  await recordFeedback({ leadId, reviewRequested: true });
  void notifyBusinessEvent({ type: "review_requested", eventKey: `review_requested:${leadId}`, title: "Client review request sent", body: `Google review request sent to ${lead.name || lead.phone}.`, lead }).catch(() => undefined);
  return { sent: true, mode: within24h ? "freeform" : "template", reviewUrl: MEDMINDS_REVIEW_COLLECTION_URL };
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid business action." }, { status: 400 });
  try {
    const input = parsed.data;
    if (input.action === "task") {
      const task = await createBusinessTask(input);
      const lead = await leadById(input.leadId);
      void notifyBusinessEvent({ type: "operations_task", eventKey: `operations_task:${String((task as { id?: string }).id)}`, title: "New MedMinds operations task", body: `Task: ${input.title}\nAssigned to: ${input.assignedTo || "Unassigned"}${input.dueAt ? `\nDue: ${input.dueAt}` : ""}`, lead }).catch(() => undefined);
      return NextResponse.json(task);
    }
    if (input.action === "task_status") return NextResponse.json(await updateBusinessTask(input));
    if (input.action === "payment") {
      const payment = await recordPayment(input);
      const lead = await leadById(input.leadId);
      const type = input.verified ? "payment_verified" : "payment_pending";
      void notifyBusinessEvent({ type, eventKey: `${type}:${String((payment as { id?: string }).id)}`, title: input.verified ? "Payment verified" : "Payment recorded, verification pending", body: `Amount: K${input.amountZmw.toLocaleString()}${input.reference ? `\nReference: ${input.reference}` : ""}`, lead }).catch(() => undefined);
      if (input.verified) return NextResponse.json({ ...payment, ...(await trySendReceipt(lead, payment)) });
      return NextResponse.json(payment);
    }
    if (input.action === "verify_payment") {
      const payment = await verifyPayment(input) as { id?: string; lead_id?: string; amount_zmw?: number; reference?: string; status?: string; verified_at?: string; verified_by?: string };
      const lead = await leadById(payment.lead_id);
      void notifyBusinessEvent({ type: "payment_verified", eventKey: `payment_verified:${String(payment.id)}`, title: "Payment verified", body: `Amount: K${Number(payment.amount_zmw || 0).toLocaleString()}${payment.reference ? `\nReference: ${payment.reference}` : ""}`, lead }).catch(() => undefined);
      return NextResponse.json({ ...payment, ...(await trySendReceipt(lead, payment)) });
    }
    if (input.action === "send_receipt") {
      const snapshot = await getBusinessSnapshot();
      const payment = snapshot.payments.find((item: any) => item.id === input.paymentId);
      if (!payment) throw new Error("Payment record not found.");
      if (payment.status !== "VERIFIED") throw new Error("Only verified payments can be sent as receipts.");
      const lead = await leadById(payment.lead_id);
      if (!lead) throw new Error("The client linked to this payment could not be found.");
      return NextResponse.json(await sendBrandedReceiptPdf({ lead, payment }));
    }
    if (input.action === "quote") {
      const quote = await createQuote(input);
      const lead = await leadById(input.leadId);
      void notifyBusinessEvent({ type: "quote_created", eventKey: `quote_created:${String((quote as { id?: string }).id)}`, title: "New MedMinds quotation", body: `Service: ${input.service}\nAmount: ${input.amountZmw == null ? "Tailored quotation" : `K${input.amountZmw.toLocaleString()}\n${input.details}`}`, lead }).catch(() => undefined);
      return NextResponse.json(quote);
    }
    if (input.action === "review_request") return NextResponse.json(await sendReviewRequest(input.leadId));
    return NextResponse.json(await recordFeedback(input));
  } catch (error) {
    console.error("Business action failed", { action: parsed.data.action, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete the action." }, { status: 500 });
  }
}
