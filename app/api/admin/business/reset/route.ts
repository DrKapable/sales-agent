import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sessionCookieName, verifySessionToken } from "@/lib/session";
import { resetSalesActivity } from "@/lib/sales-data-maintenance";

const schema = z.object({
  confirmation: z.literal("RESET SALES DATA"),
  adminPassword: z.string().min(1).max(300)
});

function sameSecret(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!verifySessionToken(request.cookies.get(sessionCookieName)?.value)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the required confirmation and administrator password." }, { status: 400 });
  }
  if (!process.env.ADMIN_PASSWORD || !sameSecret(parsed.data.adminPassword, process.env.ADMIN_PASSWORD)) {
    return NextResponse.json({ error: "Incorrect administrator password." }, { status: 403 });
  }
  try {
    const result = await resetSalesActivity();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Sales workspace reset failed", { error });
    return NextResponse.json({
      error: "Reset could not be completed. No records were cleared if the database transaction failed."
    }, { status: 500 });
  }
}
