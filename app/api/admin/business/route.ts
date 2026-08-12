import { NextResponse } from "next/server";
import { z } from "zod";
import { createBusinessTask, createQuote, getBusinessSnapshot, recordFeedback, recordPayment } from "@/lib/business-ops";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("task"), leadId: z.string().optional(), title: z.string().min(2).max(240), assignedTo: z.string().max(160).optional(), dueAt: z.string().datetime().optional(), notes: z.string().max(1200).optional() }),
  z.object({ action: z.literal("payment"), leadId: z.string().min(1), amountZmw: z.number().positive(), reference: z.string().max(160).optional(), verified: z.boolean().optional(), verifiedBy: z.string().max(160).optional() }),
  z.object({ action: z.literal("quote"), leadId: z.string().min(1), service: z.string().min(2).max(240), amountZmw: z.number().nonnegative().optional(), details: z.string().min(3).max(1800) }),
  z.object({ action: z.literal("feedback"), leadId: z.string().min(1), rating: z.number().int().min(1).max(5).optional(), comment: z.string().max(1200).optional(), reviewRequested: z.boolean().optional() })
]);

export async function GET() {
  try {
    return NextResponse.json(await getBusinessSnapshot());
  } catch (error) {
    console.error("Business snapshot failed", { error });
    return NextResponse.json({ error: "Unable to load business intelligence." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid business action." }, { status: 400 });
  try {
    const input = parsed.data;
    if (input.action === "task") return NextResponse.json(await createBusinessTask(input));
    if (input.action === "payment") return NextResponse.json(await recordPayment(input));
    if (input.action === "quote") return NextResponse.json(await createQuote(input));
    return NextResponse.json(await recordFeedback(input));
  } catch (error) {
    console.error("Business action failed", { action: parsed.data.action, error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete the action." }, { status: 500 });
  }
}
