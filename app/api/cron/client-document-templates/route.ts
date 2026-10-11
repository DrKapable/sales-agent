import { NextResponse } from "next/server";
import { isAuthorizedTemplateSetup } from "@/lib/template-setup-auth";
import { clientDocumentTemplateResults } from "@/lib/client-document-templates";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

async function run(request: Request, ensure: boolean) {
  if (!isAuthorizedTemplateSetup(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const templates = await clientDocumentTemplateResults(ensure);
  return NextResponse.json({ templates }, { status: templates.some((item) => "error" in item) ? 502 : 200 });
}
export async function GET(request: Request) { return run(request, false); }
export async function POST(request: Request) { return run(request, true); }
