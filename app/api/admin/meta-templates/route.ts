import { NextResponse } from "next/server";
import { z } from "zod";
import { humanMessageContent } from "@/lib/conversation";
import { listApprovedMetaTemplates, sendApprovedMetaTemplate } from "@/lib/meta-templates";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { addMessage, getOrCreateLead, updateLead } from "@/lib/store";

const sendSchema = z.object({
  phone: z.string().min(8).max(30),
  name: z.string().regex(/^[a-z0-9_]+$/i).max(512),
  language: z.string().min(2).max(20),
  sender: z.string().trim().min(2).max(120).default("Administrator"),
  components: z.array(z.object({
    type: z.enum(["header", "body"]),
    parameters: z.array(z.object({ type: z.literal("text"), text: z.string().min(1).max(1024) })).max(20)
  })).max(2).optional()
});

export async function GET() {
  try {
    const templates = await listApprovedMetaTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Unable to load approved Meta templates", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load approved Meta templates." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid template request." }, { status: 400 });
  try {
    const approved = await listApprovedMetaTemplates();
    const template = approved.find((item) => item.name === parsed.data.name && item.language === parsed.data.language);
    if (!template) return NextResponse.json({ error: "This template is not currently approved in Meta." }, { status: 409 });
    const sent = await sendApprovedMetaTemplate(parsed.data);
    const lead = await getOrCreateLead(parsed.data.phone, "whatsapp");
    const label = `[Meta template: ${template.name}]`;
    await addMessage(lead.phone, "assistant", humanMessageContent(parsed.data.sender, label), sent.messageId);
    await recordOutgoingMessageAccepted({ messageId: sent.messageId, phone: lead.phone }).catch(() => undefined);
    await updateLead(lead.phone, { aiPaused: true, assignedTo: parsed.data.sender, status: "FOLLOW-UP REQUIRED" }).catch(() => undefined);
    return NextResponse.json({ ok: true, messageId: sent.messageId, template: template.name });
  } catch (error) {
    console.error("Admin Meta template send failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Meta did not accept this template." }, { status: 502 });
  }
}
