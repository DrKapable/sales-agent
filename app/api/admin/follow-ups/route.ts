import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completeHumanFollowUp,
  listHumanFollowUps,
  scheduleManualHumanFollowUp,
  sendHumanFollowUpSms,
  syncHumanFollowUpQueue
} from "@/lib/human-follow-ups";
import { isFollowUpTeamMember } from "@/lib/follow-up-team";
import { manualFollowUpOptions } from "@/lib/manual-follow-up-options";

const BACKGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastBackgroundSyncAt = 0;

const teamMemberSchema = z.string().trim().min(2).max(120).refine(isFollowUpTeamMember, {
  message: "Choose a valid follow-up team member."
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("schedule"),
    phone: z.string().trim().min(8).max(40),
    scheduledAt: z.string().min(10).max(80),
    reason: z.string().trim().max(500).optional(),
    createdBy: teamMemberSchema
  }),
  z.object({
    action: z.literal("send_sms"),
    taskId: z.string().uuid(),
    message: z.string().trim().min(1).max(1200)
  }),
  z.object({
    action: z.literal("complete"),
    taskId: z.string().uuid(),
    completedBy: teamMemberSchema,
    channel: z.enum(["CALL", "WHATSAPP", "SMS"]),
    summary: z.string().trim().min(5).max(1600),
    outcome: z.enum(["REACHED_CONTINUE", "NO_ANSWER", "INTERESTED", "READY_TO_PROCEED", "NOT_INTERESTED", "OTHER"]),
    nextMode: z.enum(["tomorrow", "manual", "drop"]),
    nextAt: z.string().max(80).nullable().optional()
  })
]);

function queueBackgroundFollowUpSync() {
  const now = Date.now();
  if (now - lastBackgroundSyncAt < BACKGROUND_SYNC_INTERVAL_MS) return;
  lastBackgroundSyncAt = now;

  after(async () => {
    try {
      await syncHumanFollowUpQueue({ notifyDue: false });
    } catch (error) {
      lastBackgroundSyncAt = 0;
      console.error("Background human follow-up sync failed", { error });
    }
  });
}

function manualClientPool(data: Awaited<ReturnType<typeof listHumanFollowUps>>) {
  const byPhone = new Map<string, any>();
  for (const lead of data.availableLeads) byPhone.set(lead.phone, lead);
  for (const task of data.tasks) {
    if (task.lead) byPhone.set(task.lead.phone, task.lead);
  }
  return manualFollowUpOptions([...byPhone.values()] as any);
}

export async function GET() {
  const startedAt = Date.now();
  try {
    // Return the current queue first. The full lead/conversation sync is expensive and
    // should never block the workspace from rendering.
    const data = await listHumanFollowUps();
    queueBackgroundFollowUpSync();

    return NextResponse.json(
      {
        ...data,
        // Re-include active clients that already have a pending/historical follow-up so
        // the human team can manually reschedule them without another expensive lead query.
        availableLeads: manualClientPool(data),
        loadMs: Date.now() - startedAt
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Human follow-up workspace load failed", { error });
    return NextResponse.json({ error: "Unable to load follow-ups right now." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Invalid follow-up action.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  try {
    if (parsed.data.action === "schedule") {
      const scheduledAt = new Date(parsed.data.scheduledAt);
      if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Choose a future follow-up date and time." }, { status: 400 });
      }
      const task = await scheduleManualHumanFollowUp(parsed.data);
      return NextResponse.json({ ok: true, task });
    }
    if (parsed.data.action === "send_sms") {
      const result = await sendHumanFollowUpSms(parsed.data.taskId, parsed.data.message);
      return NextResponse.json({ ok: true, result });
    }
    const result = await completeHumanFollowUp(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Human follow-up action failed", { action: parsed.data.action, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the follow-up." }, { status: 400 });
  }
}
