import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { staffSessionOpen, staffTemplateStatus, ensureStaffNotificationTemplate, sendStaffAlert, allStaffTemplateStatuses, ensureAllStaffNotificationTemplates } from "@/lib/team-alert-transport";
import { referralRecipients } from "@/lib/referrals";
import { getBusinessSnapshot } from "@/lib/business-ops";
import { staffAlertRecipients } from "@/lib/team-notifications";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (new URL(request.url).searchParams.get("templates") === "all") {
      return NextResponse.json({ templates: await allStaffTemplateStatuses(), recipients: staffAlertRecipients });
    }
    const [template, directorSessionOpen] = await Promise.all([staffTemplateStatus(), staffSessionOpen(referralRecipients.mustafa.phone!)]);
    // Loading the snapshot also reconciles assignments previously held by removed staff.
    const snapshot = await getBusinessSnapshot();
    return NextResponse.json({ template, directorSessionOpen, staff: Object.values(referralRecipients).map(({ name, roles }) => ({ name, roles })), totalLeads: snapshot.metrics.totalLeads });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Notification readiness check failed." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = await request.json().catch(() => ({}));
    if (input.action === "ensure_all") return NextResponse.json({ templates: await ensureAllStaffNotificationTemplates() });
    if (input.action === "test_director") {
      const result = await sendStaffAlert({ phone: referralRecipients.mustafa.phone!, name: referralRecipients.mustafa.name,
        heading: "Mary Kaunda notification setup", body: "Your number is configured for new clients, hot clients, daily management summaries and copies of marketing referrals. Monica and Counsel Chisha Chomba have been removed from active routing." });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ template: await ensureStaffNotificationTemplate() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Notification configuration failed." }, { status: 502 });
  }
}
