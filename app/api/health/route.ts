import { NextResponse } from "next/server";
import { runOneTimeTestDataReset } from "@/lib/client-records";
import { getSetupState } from "@/lib/env";

export async function GET() {
  const setup = getSetupState();
  let reset = { applied: false, alreadyApplied: false, deletedClients: 0 };

  if (setup.database === "postgres") {
    try {
      reset = await runOneTimeTestDataReset();
    } catch (error) {
      console.error("One-time client data reset failed", { error });
      return NextResponse.json({ status: "degraded", service: "medminds-sales-agent", error: "Database maintenance failed." }, { status: 500 });
    }
  }

  return NextResponse.json({
    status: "ok",
    service: "medminds-sales-agent",
    configured: {
      ai: setup.aiConfigured,
      simulator: setup.simulatorEnabled,
      database: setup.database === "postgres",
      whatsapp: setup.whatsappConfigured,
      admin: setup.adminConfigured
    },
    maintenance: {
      testDataResetApplied: reset.applied,
      testDataResetAlreadyApplied: reset.alreadyApplied,
      deletedClients: reset.deletedClients
    }
  });
}
