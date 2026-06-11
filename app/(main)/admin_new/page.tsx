import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ExecutiveDashboardView } from "@/components/admin/ExecutiveDashboardView";
import { EXECUTIVE_DASHBOARD_FIXTURE } from "@/lib/fixtures/executive-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminNewPage() {
  const user = await requireAuth();
  if (!user.is_admin) {
    redirect("/?forbidden=admin");
  }

  return <ExecutiveDashboardView data={EXECUTIVE_DASHBOARD_FIXTURE} />;
}
