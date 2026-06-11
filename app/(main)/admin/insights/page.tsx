import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/db/queries";
import { computeInsights } from "@/lib/admin/insights";
import { InsightsView } from "@/components/admin/InsightsView";

// /admin/insights · AI 洞察页（DASHBOARD_NOTES §4 拍板）
// 每次访问实时跑规则计算（不持久化洞察主体），与 insight_actions LEFT JOIN 得到状态
// admin only

export const dynamic = "force-dynamic";

export default async function AdminInsightsPage() {
  const user = await requireAuth();
  if (!user.is_admin) {
    redirect("/?forbidden=admin");
  }

  const result = await computeInsights();

  await writeAuditLog({
    user_id: user.id,
    action: "admin_view_insights",
    metadata: { active_count: result.activeCount }
  });

  return <InsightsView groups={result.groups} activeCount={result.activeCount} />;
}
