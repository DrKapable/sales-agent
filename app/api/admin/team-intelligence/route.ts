import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sessionCookieName, verifySessionToken } from "@/lib/session";
import { listTeamMembers, saveTeamMember } from "@/lib/internal-team-registry";

const updateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(25),
  role: z.enum(["director", "sales", "marketing", "support"]),
  active: z.boolean(),
  adminPassword: z.string().min(1).max(256)
});
function authenticated(request: NextRequest) {
  return verifySessionToken(request.cookies.get(sessionCookieName)?.value);
}
function originMatches(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
function passwordMatches(given: string) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const a = Buffer.from(given), b = Buffer.from(expected);
  return Boolean(expected) && a.length === b.length && timingSafeEqual(a,b);
}
export async function GET(request: NextRequest) {
  if (!authenticated(request)) return NextResponse.json({error:"Unauthorised."},{status:401});
  try { return NextResponse.json({members:await listTeamMembers()}); }
  catch (error) {
    console.error("Unable to read internal staff directory", {error});
    return NextResponse.json({error:"Unable to read team members."},{status:500});
  }
}
export async function PUT(request: NextRequest) {
  if (!authenticated(request)) return NextResponse.json({error:"Unauthorised."},{status:401});
  if (!originMatches(request)) return NextResponse.json({error:"Invalid request origin."},{status:403});
  const parsed=updateSchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:"Provide a valid member, phone and role."},{status:400});
  const {adminPassword,...member}=parsed.data;
  if (!passwordMatches(adminPassword)) return NextResponse.json({error:"Incorrect administrator password."},{status:403});
  try {
    const saved=await saveTeamMember(member);
    return NextResponse.json({member:saved});
  } catch (error) {
    console.error("Unable to update team member", {error});
    return NextResponse.json({error:error instanceof Error ? error.message : "Cannot update staff member."},{status:400});
  }
}
