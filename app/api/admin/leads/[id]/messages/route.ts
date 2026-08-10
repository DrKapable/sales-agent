import { NextResponse } from "next/server";
import { z } from "zod";
import { humanMessageContent, replyWindow } from "@/lib/conversation";
import { addMessage, getConversation, listLeads, updateLead } from "@/lib/store";
import { sendWhatsAppText } from "@/lib/whatsapp";

const sendSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  sender: z.enum(["Dr. Mustafa Juma Phiri", "Dr Kanyembo Ng'andwe"])
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
  if (state.lead.source === "whatsapp") await sendWhatsAppText(state.lead.phone, parsed.data.text);
  await addMessage(state.lead.phone, "assistant", humanMessageContent(parsed.data.sender, parsed.data.text));
  const lead = await updateLead(state.lead.phone, { aiPaused: true, assignedTo: parsed.data.sender, status: "HUMAN ASSISTANCE REQUIRED" });
  const messages = await getConversation(state.lead.phone, 100);
  return NextResponse.json({ lead, messages, replyWindow: replyWindow(messages) });
}

