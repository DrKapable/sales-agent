import { AdminDashboardClient } from "@/components/admin-dashboard-client";
import { TeamAdminEnhancer } from "@/components/team-admin-enhancer";
import { getSetupState } from "@/lib/env";
import { listOffers } from "@/lib/store";
import { listActiveLeads } from "@/lib/chat-lifecycle";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [leads, offers] = await Promise.all([listActiveLeads(), listOffers()]);
  return <><AdminDashboardClient initialLeads={leads} initialOffers={offers} setup={getSetupState()} /><TeamAdminEnhancer /></>;
}
