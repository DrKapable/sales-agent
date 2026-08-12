import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { notifyConversationClosed } from "@/lib/closure-summary";
import { leadPriorities, leadStatuses, type LeadPatch } from "@/lib/types";
import { staffNames } from "@/lib/team-directory";
import { listLeads, updateLead } from "@/lib/store";

const HUMAN_TAKEOVER_PREFIX = "[HUMAN TAKEOVER]";

const schema = z.object({
  status: z.enum(leadStatuses).optional(),
  aiPaused: z.boolean().optional(),
  assignedTo: z.enum(staffNames).nullable().optional(),
  internalNote: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(leadPriorities).optional(),
  followUpAt: z.string().datetime().nullable().optional()
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, parsed] = await Promise.all([params, request.json().catch(() => null).then((body) => schema.safeParse(body))]);
  const lead = (await listLeads()).find((item) => item.id === id);
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead update." }, { status: 400 });

  const patch: LeadPatch = { ...parsed.data };
  if (parsed.data.aiPaused === true) {
    const existingReason = lead.handoffReason?.replace(/^\[HUMAN TAKEOVER]\s*/, "").trim();
    patch.handoffReason = existingReason ? `${HUMAN_TAKEOVER_PREFIX} ${existingReason}` : HUMAN_TAKEOVER_PREFIX;
  }
  if (parsed.data.aiPaused === false && lead.handoffReason?.startsWith(HUMAN_TAKEOVER_PREFIX)) {
    const restoredReason = lead.handoffReason.slice(HUMAN_TAKEOVER_PREFIX.length).trim();
    patch.handoffReason = restoredReason || null;
  }

  const updated = await updateLead(lead.phone, patch);
  const terminalTransition = parsed.data.status && parsed.data.status !== lead.status && ["CONVERTED", "LOST LEAD"].includes(parsed.data.status);
  if (terminalTransition) {
    const reason = parsed.data.status === "CONVERTED" ? "Converted" as const : "Lost lead" as const;
    after(async () => {
      try {
        await notifyConversationClosed({ lead: updated, reason });
      } catch (error) {
        console.error("Terminal lead closure notification failed", { phoneSuffix: updated.phone.slice(-4), status: updated.status, error });
      }
    });
  }

  return NextResponse.json(updated);
}
