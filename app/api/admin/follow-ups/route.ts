import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completeHumanFollowUp,
  listHumanFollowUps,
  scheduleManualHumanFollowUp,
  sendHumanFollowUpSms,
  syncHumanFollowUpQueue
} from "@/lib/human-follow-ups";
import { manualFollowUpOptions } from "@/lib/manual-follow-up-options";
import { listLeads } from "@/lib/store";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("schedule"),
    phone: z.string().trim().min(8).max(40),
    scheduledAt: z.string().min(10).max(80),
    reason: z.string().trim().max(500).optional(),
    createdBy: z.string().trim().min(2).max(120)
  }),
  z.object({
    action: z.literal("send_sms"),
    taskId: z.string().uuid(),
    message: z.string().trim().min(1).max(1200)
  }),
  z.object({
    action: z.literal("complete"),
    taskId: z.string().uuid(),
    completedBy: z.string().trim().min(2).max(120),
    channel: z.enum(["CALL", "WHATSAPP", "SMS"]),
    summary: z.string().trim().min(5).max(1600),
    outcome: z.enum(["REACHED_CONTINUE", "NO_ANSWER", "INTERESTED", "READY_TO_PROCEED", "NOT_INTERESTED", "OTHER"]),
    nextMode: z.enum(["tomorrow", "manual", "drop"]),
    nextAt: z.string().max(80).nullable().optional()
  })
]);

export async function GET() {
  try {
    await syncHumanFollowUpQueue({ notifyDue: false });
    const [data, leads] = await Promise.all([listHumanFollowUps(), listLeads()]);
    return NextResponse.json(
      { ...data, availableLeads: manualFollowUpOptions(leads) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Human follow-up workspace load failed", { error });
    return NextResponse.json({ error: "Unable to load follow-ups right now." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid follow-up action." }, { status: 400 });
  try {
    if (parsed.data.action === "schedule") {
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
