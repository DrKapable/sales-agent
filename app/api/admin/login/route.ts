import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, sessionCookieName } from "@/lib/session";

const schema = z.object({ password: z.string().min(1).max(500) });

export async function POST(request: Request) {
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) return NextResponse.json({ error: "Admin access has not been configured." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  const actual = createHash("sha256").update(parsed.data.password).digest();
  const expected = createHash("sha256").update(process.env.ADMIN_PASSWORD).digest();
  if (!timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, createSessionToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 });
  return response;
}

