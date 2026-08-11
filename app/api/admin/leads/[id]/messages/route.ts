import { NextResponse } from "next/server";
import { z } from "zod";
import { humanMessageContent, replyWindow } from "@/lib/conversation";
import { staffNames } from "@/lib/team-directory";
import { addMessage, getConversation, listLeads, updateLead } from "@/lib/store";
import { sendWhatsAppText } from "@/lib/whatsapp";

const sendSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  sender: z.enum(staffNames)
});

async function leadAndMessages(id: string) {
  const lead = (await listLeads()).find((item) => item.id === id);
  if (!lead) return null;
  return { lead, messages: await getConversation(lead.phone, 100) };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const state = await leadAndMessages((await params).id);
  if (!state) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  return NextResponse.json({ ...state, replyWindow: replyWindow(state.messages) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, parsed] = await Promise.all([params, request.json().catch(() => null).then((body) => sendSchema.safeParse(body))]);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid reply and staff member." }, { status: 400 });
  const state = await leadAndMessages(id);
  if (!state) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (!state.lead.aiPaused) return NextResponse.json({ error: "Take over this conversation before sending a human reply." }, { status: 409 });
  const window = replyWindow(state.messages);
  if (state.lead.source === "whatsapp" && !window.open) {
    return NextResponse.json({ error: "The 24-hour WhatsApp reply window has closed. Use an approved Meta template to reopen the conversation." }, { status: 409 });
  }
  let externalId: string | null = null;
  let delivery: { status: "accepted" | "simulated"; messageId: string | null } = { status: "simulated", messageId: null };
  if (state.lead.source === "whatsapp") {
    try {
      console.info("Admin WhatsApp reply sending", { leadId: state.lead.id, sender: parsed.data.sender });
      const sent = await sendWhatsAppText(state.lead.phone, parsed.data.text);
      externalId = sent.messageId;
      delivery = { status: "accepted", messageId: sent.messageId };
      console.info("Admin WhatsApp reply accepted by Meta", { leadId: state.lead.id, messageId: sent.messageId });
    } catch (error) {
      console.error("Admin WhatsApp reply failed", { leadId: state.lead.id, error });
      return NextResponse.json({ error: "Meta did not accept this WhatsApp reply. Check the production log for the specific reason." }, { status: 502 });
    }
  }
  await addMessage(state.lead.phone, "assistant", humanMessageContent(parsed.data.sender, parsed.data.text), externalId);
  const lead = await updateLead(state.lead.phone, { aiPaused: true, assignedTo: parsed.data.sender, status: "HUMAN ASSISTANCE REQUIRED" });
  const messages = await getConversation(state.lead.phone, 100);
  return NextResponse.json({ lead, messages, replyWindow: replyWindow(messages), delivery });
}
