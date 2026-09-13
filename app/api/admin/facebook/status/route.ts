import { NextResponse } from "next/server";
import { getFacebookConnectionStatus } from "@/lib/facebook-connection";

export async function GET() {
  return NextResponse.json(await getFacebookConnectionStatus());
}
