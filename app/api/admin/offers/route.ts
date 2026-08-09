import { NextResponse } from "next/server";
import { z } from "zod";
import { saveOffer } from "@/lib/store";

const schema = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(180), category: z.string().min(1).max(100), description: z.string().min(1).max(1000), features: z.array(z.string().min(1).max(200)).max(20), priceZmw: z.number().nonnegative().nullable(), paymentInstructions: z.string().max(1200).nullable(), active: z.boolean() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid offer details." }, { status: 400 });
  if (parsed.data.active && (parsed.data.priceZmw === null || !parsed.data.paymentInstructions)) return NextResponse.json({ error: "An active offer requires a verified price and payment instructions." }, { status: 400 });
  return NextResponse.json(await saveOffer(parsed.data));
}

