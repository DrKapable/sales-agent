import { AdminDashboard } from "@/components/admin-dashboard";
import { getSetupState } from "@/lib/env";
import { listLeads, listOffers } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [leads, offers] = await Promise.all([listLeads(), listOffers()]);
  return <AdminDashboard initialLeads={leads} initialOffers={offers} setup={getSetupState()} />;
}

