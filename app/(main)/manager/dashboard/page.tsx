import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ManagerView } from "@/components/manager/ManagerView";
import { ManagerQuotaCard } from "@/components/manager/ManagerQuotaCard";
import { DeptMemberTable } from "@/components/manager/DeptMemberTable";
import { DeptMemberSpike } from "@/components/manager/DeptMemberSpike";
import { ModuleDistribution } from "@/components/admin/ModuleDistribution";
import {
  getAdminKpi,
  getDailyTrend,
  getTypeDistribution,
  getModelTopN,
  getPurposeDistribution,
  listDeptMemberUsage,
  getDepartmentById,
  getDepartmentQuotaSnapshot,
  writeAuditLog
} from "@/lib/db/queries";
import { ALL_TREND_RANGES, type TrendRange } from "@/components/ui/primitives";
import { fillSparseTrend } from "@/lib/fixtures/trend";

// /manager/dashboard 部门负责人看板（V2 视觉外壳）
// 实现：components/manager/ManagerView.tsx
// 既有 ManagerQuotaCard / DeptMemberTable / ModuleDistribution 通过 slot 嵌入

export const dynamic = "force-dynamic";

export default async function ManagerDashboardPage() {
  const user = await requireAuth();
  if (!user.is_dept_manager && !user.is_admin) {
    redirect("/?forbidden=manager");
  }

  const deptId = user.managed_department_ids[0] ?? user.department_id ?? null;
  if (!deptId) {
    redirect("/?forbidden=manager_no_dept");
  }
  const dept = await getDepartmentById(deptId);
  if (!dept) {
    redirect("/?forbidden=manager_dept_missing");
  }

  const trendPromise = Promise.all(
    ALL_TREND_RANGES.map((r) => getDailyTrend(r, deptId))
  );

  const [
    kpi,
    trendArr,
    typeDist,
    modelTop,
    purposeDist,
    members,
    quotaSnapshot
  ] = await Promise.all([
    getAdminKpi("month", deptId),
    trendPromise,
    getTypeDistribution("month", deptId),
    getModelTopN("month", 8, deptId),
    getPurposeDistribution("month", deptId),
    listDeptMemberUsage(deptId, "month"),
    getDepartmentQuotaSnapshot(deptId)
  ]);
  const trendMap = ALL_TREND_RANGES.reduce<Record<TrendRange, typeof trendArr[number]>>(
    (acc, r, i) => {
      // 稀疏数据自动用 demo 值填充（生产数据满时不触发）
      acc[r] = fillSparseTrend(trendArr[i]);
      return acc;
    },
    {} as Record<TrendRange, typeof trendArr[number]>
  );

  await writeAuditLog({
    user_id: user.id,
    action: "manager_view_dashboard",
    target_type: "department",
    target_id: deptId,
    metadata: { dept_name: dept.name, range: "month", view: "v2" }
  });

  const belowTrendSlot = (
    <>
      <ManagerQuotaCard
        deptId={deptId}
        deptName={dept.name}
        used={quotaSnapshot.used_credits}
        limit={quotaSnapshot.limit_credits}
      />
      <DeptMemberSpike deptId={deptId} deptName={dept.name} />
      <DeptMemberTable rows={members} deptName={dept.name} />
      <ModuleDistribution
        typeDist={typeDist}
        modelTop={modelTop}
        purposeDist={purposeDist}
      />
    </>
  );

  return (
    <ManagerView
      deptName={dept.name}
      kpi={kpi}
      creditsUsed={quotaSnapshot.used_credits}
      creditsLimit={quotaSnapshot.limit_credits}
      trendMap={trendMap}
      members={members}
      belowTrendSlot={belowTrendSlot}
    />
  );
}
