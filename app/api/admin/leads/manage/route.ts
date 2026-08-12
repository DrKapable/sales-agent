import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { archiveChat, deleteChat, listArchivedLeads, restoreChat } from "@/lib/chat-lifecycle";
import { notifyConversationClosed } from "@/lib/closure-summary";
import { listLeads } from "@/lib/store";

const actionSchema = z.object({
  phone: z.string().trim().min(1).max(160).optional(),
  leadId: z.string().trim().min(1).max(160).optional(),
  action: z.enum(["archive", "restore", "delete"])
}).refine((value) => Boolean(value.phone || value.leadId), {
  message: "A client identifier is required."
});

async function resolveLead(input: { phone?: string; leadId?: string }) {
  const leads = await listLeads();

  if (input.leadId) {
    const byId = leads.find((lead) => lead.id === input.leadId);
    if (byId) return byId;
  }

  if (!input.phone) return null;
  const raw = input.phone.split("·")[0]?.trim() || input.phone.trim();
  const exact = leads.find((lead) => lead.phone === raw);
  if (exact) return exact;

  const digits = raw.replace(/\D/g, "");
  if (digits) {
    const byDigits = leads.find((lead) => lead.phone.replace(/\D/g, "") === digits);
    if (byDigits) return byDigits;
  }

  return null;
}

export async function GET() {
  return NextResponse.json({ chats: await listArchivedLeads() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    console.warn("Invalid chat lifecycle action", { body, issues: parsed.error.issues });
    return NextResponse.json({ error: "Invalid chat action. Refresh the inbox and try again." }, { status: 400 });
  }

  const { action } = parsed.data;
  const lead = await resolveLead(parsed.data);
  if (!lead) {
    return NextResponse.json({ error: "Client could not be found. Refresh the inbox and try again." }, { status: 404 });
  }

  try {
    if (action === "archive") {
      const archivedAt = await archiveChat(lead.phone);
      after(async () => {
        try {
          await notifyConversationClosed({ lead, reason: "Archived" });
        } catch (error) {
          console.error("Archived chat closure notification failed", { phoneSuffix: lead.phone.slice(-4), error });
        }
      });
      return NextResponse.json({ ok: true, action, archivedAt });
    }
    if (action === "restore") {
      await restoreChat(lead.phone);
      return NextResponse.json({ ok: true, action });
    }
    await deleteChat(lead.phone);
    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("Chat lifecycle action failed", { action, phoneSuffix: lead.phone.slice(-4), error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update this chat." }, { status: 500 });
  }
}
