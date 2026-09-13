import { NextResponse } from "next/server";
import { deleteFacebookConnection, getFacebookConfig } from "@/lib/facebook-connection";

export async function POST() {
  const config = getFacebookConfig();
  if (config.staticConfigured) {
    return NextResponse.json({ error: "This Facebook connection is supplied by environment variables. Remove the configured Page token to disconnect it." }, { status: 409 });
  }
  await deleteFacebookConnection();
  return NextResponse.json({ connected: false });
}
