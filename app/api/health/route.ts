import { NextResponse } from "next/server";
import { getSetupState } from "@/lib/env";

export function GET() {
  const setup = getSetupState();
  return NextResponse.json({ status: "ok", service: "medminds-sales-agent", configured: { ai: setup.aiConfigured, simulator: setup.simulatorEnabled, database: setup.database === "postgres", whatsapp: setup.whatsappConfigured, admin: setup.adminConfigured } });
}
