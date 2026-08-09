import { NextResponse } from "next/server";
import { z } from "zod";
import { leadStatuses } from "@/lib/types";
import { listLeads, updateLead } from "@/lib/store";

const schema = z.object({ status: z.enum(leadStatuses) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, parsed] = await Promise.all([params, request.json().catch(() => null).then((body) => schema.safeParse(body))]);
  const lead = (await listLeads()).find((item) => item.id === id);
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead status." }, { status: 400 });
  return NextResponse.json(await updateLead(lead.phone, { status: parsed.data.status }));
}

