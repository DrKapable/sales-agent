import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertExternalBusinessTask, type BusinessTaskPriority } from "@/lib/business-ops";
import { listLeads } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prioritySchema = z.enum(["low", "normal", "standard", "high", "urgent"]);
const payloadSchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(2).max(240),
  notes: z.string().max(4000).optional(),
  priority: prioritySchema.optional(),
  dueAt: z.string().max(120).optional(),
  status: z.string().max(80).optional(),
  assignedTo: z.string().max(180).optional(),
  program: z.string().max(180).optional(),
  academicLevel: z.string().max(180).optional(),
  client: z.object({
    id: z.string().max(180).optional(),
    name: z.string().max(180).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(50).optional()
  }).optional()
}).strict();

function authorized(header: string | null) {
  const expected = process.env.RESEARCH_ASSISTANT_SECRET;
  if (!header || !expected || !header.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7));
  const target = Buffer.from(expected);
  return received.length === target.length && timingSafeEqual(received, target);
}

function normalizePriority(value?: z.infer<typeof prioritySchema>): BusinessTaskPriority {
  if (value === "normal" || !value) return "standard";
  return value;
}

function normalizePhone(value?: string) {
  if (!value) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `260${digits.slice(1)}`;
  return digits;
}

function portalStatus(value?: string) {
  return /complete|completed|done|closed/i.test(value || "") ? "COMPLETED" as const : "OPEN" as const;
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Research Portal task payload." }, { status: 400 });
  }

  try {
    const input = parsed.data;
    const clientPhone = normalizePhone(input.client?.phone);
    const clientEmail = input.client?.email?.trim().toLowerCase() || "";
    const leads = clientPhone || clientEmail ? await listLeads() : [];
    const lead = leads.find((item) => {
      if (clientPhone && normalizePhone(item.phone) === clientPhone) return true;
      return Boolean(clientEmail && item.email?.trim().toLowerCase() === clientEmail);
    }) || null;

    const sourceClient = input.client?.name?.trim() || input.client?.email?.trim() || input.client?.phone?.trim() || undefined;
    const task = await upsertExternalBusinessTask({
      leadId: lead?.id,
      title: input.title,
      assignedTo: input.assignedTo?.trim() || undefined,
      dueAt: input.dueAt?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      priority: normalizePriority(input.priority),
      source: "research-portal",
      externalId: input.externalId,
      program: input.program?.trim() || undefined,
      academicLevel: input.academicLevel?.trim() || undefined,
      sourceClient,
      status: portalStatus(input.status)
    });

    return NextResponse.json({
      ok: true,
      mirrored: true,
      taskId: (task as { id?: string }).id,
      researchPortalTaskId: input.externalId,
      leadLinked: Boolean(lead)
    });
  } catch (error) {
    console.error("Research Portal to Business Intelligence task sync failed", { error });
    return NextResponse.json({ error: "Unable to synchronize the Research Portal task to Business Intelligence." }, { status: 500 });
  }
}
