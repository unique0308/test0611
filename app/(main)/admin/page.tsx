import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { AdminView } from "@/components/admin/AdminView";
import { TaskRecordsPanel } from "@/components/admin/TaskRecordsPanel";
import { PromptCollectionsPanel } from "@/components/admin/PromptCollectionsPanel";
import type { DeptDetail } from "@/components/admin/DeptOverviewPanel";
import type { DeptReimbursementSummary } from "@/components/admin/DeptDetailPanel";
import type { TrendRange } from "@/components/ui/primitives";
import { ALL_TREND_RANGES } from "@/components/ui/primitives";
import type { MultiTrend, TrendPoint, DateRange } from "@/lib/db/queries";
import { PROFILE_FIXTURE } from "@/lib/fixtures/profile";
import {
  fillSparseTrend,
  fillSparseMultiTrendSeries,
  fillSparseModelMom
} from "@/lib/fixtures/trend";

// TrendRange 与 DateRange 同名映射（DateRange 已扩展支持 6m/12m/4q/2y）
const RANGE_TO_DATE: Record<TrendRange, DateRange> = {
  "7d": "7d",
  "30d": "30d",
  "6m": "6m",
  "12m": "12m",
  "4q": "4q",
  "2y": "2y"
};
import {
  getAdminKpi,
  listDepartmentUsageByType,
  getPurposeDistributionByType,
  getModelTopN,
  getModelTopByDateWindow,
  getReimbursementStats,
  listAllTasksForAdmin,
  listAdminTaskFilterOptions,
  listAllCollectionsForAdmin,
  listAdminCollectionFilterOptions,
  getDailyTrendByDept,
  getTotalUserCount,
  getSpendBreakdown,
  getAdminAlerts,
  getPurposeDistribution,
  listDeptMemberUsage,
  listAllDepartmentQuotas,
  listAllPurposeTagsForAdmin,
  getDailyTrend,
  getUserNameById,
  writeAuditLog
} from "@/lib/db/queries";
import { listRequestsForAdmin } from "@/lib/reimbursements";
import { computeAdminTodos } from "@/lib/admin/todos";
import { computeInsights } from "@/lib/admin/insights";

// /admin 数据看板（V2 重塑：总览 master-detail + 明细 tab）
// 实现：components/admin/AdminView.tsx
// 明细 tab 嵌入既有 TaskRecordsPanel / PromptCollectionsPanel

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams
}: {
  searchParams: { tab?: string; dept?: string; focus?: string; user?: string };
}) {
  const user = await requireAuth();
  if (!user.is_admin) {
    redirect("/?forbidden=admin");
  }

  // 从部门看板"查看任务记录"跳转过来时带 ?tab=detail&dept=<dept_id>，预填明细查询
  const presetDeptId = searchParams.dept?.trim() || undefined;
  // 从 AI 洞察"员工突增"或部门成员行点击跳转带 ?tab=detail&user=<user_id>
  const presetUserId = searchParams.user?.trim() || undefined;
  const presetUserName = presetUserId
    ? (await getUserNameById(presetUserId)) ?? undefined
    : undefined;
  const defaultTab: "overview" | "detail" =
    searchParams.tab === "detail" ? "detail" : "overview";
  // AI 洞察 evidence 跳过来时带 ?focus=credit|spend|dept，预选 KPI focus
  const VALID_FOCUS = ["credit", "spend", "dept"] as const;
  const defaultFocus =
    typeof searchParams.focus === "string" &&
    (VALID_FOCUS as readonly string[]).includes(searchParams.focus)
      ? (searchParams.focus as "credit" | "spend" | "dept")
      : undefined;

  // 全公司多线趋势：6 个 range 一次 SSR 拿全
  const multiTrendPromises = Promise.all(
    ALL_TREND_RANGES.map((r) => getDailyTrendByDept(RANGE_TO_DATE[r]))
  );

  // 模型异动：本月 + 上月并行取
  const nowDate = new Date();
  const monthStartIsoStr = new Date(
    Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1)
  ).toISOString();
  const prevMonthStartIsoStr = new Date(
    Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - 1, 1)
  ).toISOString();
  const modelTopPrevPromise = getModelTopByDateWindow({
    date_from: prevMonthStartIsoStr,
    date_to: monthStartIsoStr,
    limit: 50
  });

  const [
    kpi,
    deptCross,
    multiTrendList,
    modelTop,
    modelTopPrev,
    purposeCross,
    reimbList,
    reimbStats,
    taskInitial,
    taskFilterOpts,
    collectionInitial,
    collectionFilterOpts,
    totalUsers,
    spend,
    alerts,
    quotas,
    purposeTagsAdmin
  ] = await Promise.all([
    getAdminKpi("month"),
    listDepartmentUsageByType("month"),
    multiTrendPromises,
    getModelTopN("month", 8),
    modelTopPrevPromise,
    getPurposeDistributionByType("month"),
    listRequestsForAdmin({ page: 1, page_size: 100 }),
    getReimbursementStats("month"),
    listAllTasksForAdmin({
      page: 1,
      page_size: 10,
      date_from: new Date(Date.now() - 30 * 86400_000).toISOString(),
      department_id: presetDeptId,
      user_id: presetUserId
    }),
    listAdminTaskFilterOptions(),
    listAllCollectionsForAdmin({ page: 1, page_size: 6 }),
    listAdminCollectionFilterOptions(),
    getTotalUserCount(),
    getSpendBreakdown("month"),
    getAdminAlerts(),
    listAllDepartmentQuotas(),
    listAllPurposeTagsForAdmin()
  ]);

  const multiTrendMap = ALL_TREND_RANGES.reduce<Record<TrendRange, MultiTrend>>(
    (acc, r, i) => {
      const mt = multiTrendList[i];
      // 数据稀疏时填充演示值（看完整图表形态用，生产数据满了自然不触发）
      acc[r] = { ...mt, series: mt.series.map((s) => fillSparseMultiTrendSeries(s)) };
      return acc;
    },
    {} as Record<TrendRange, MultiTrend>
  );

  // 计算模型环比（本月 vs 上月）；稀疏数据时由 fixture 合成 plausible 上月数据
  const modelTopMom = fillSparseModelMom(modelTop, modelTopPrev);

  const reimbPendingCount = reimbList.rows.filter((r) => r.status === "pending").length;

  const todoBreakdown = computeAdminTodos({
    pendingReimb: reimbPendingCount,
    quotaRows: quotas,
    purposeTagRows: purposeTagsAdmin
  });

  // 智能告警（与 /admin/insights 同源）— 顶部紧凑条用
  const insights = await computeInsights();

  // 部门 tab 数据 — 每部门并行取 purposes/models/members + 14 日趋势
  const quotaMap = new Map(quotas.map((q) => [q.department_id, q]));
  const deptDetails: DeptDetail[] = await Promise.all(
    deptCross.map(async (d) => {
      const [purposes, models, members] = await Promise.all([
        getPurposeDistribution("month", d.department_id),
        getModelTopN("month", 8, d.department_id),
        listDeptMemberUsage(d.department_id, "month")
      ]);
      const quota = quotaMap.get(d.department_id);
      const activeMembers = members.filter((m) => m.call_count > 0).length;
      return {
        dept_id: d.department_id,
        dept_name: d.department_name,
        image_credits: d.image_credits,
        video_credits: d.video_credits,
        total_credits: d.total_credits,
        credits_limit: quota?.credits_limit ?? 0,
        usage_ratio: quota?.usage_ratio ?? 0,
        member_count: members.length,
        active_member_count: activeMembers,
        purposes,
        models,
        // 详情态成员排行需要全部成员；列表态只用 top 5（仍兼容）
        top_members: members.map((m) => ({
          user_id: m.user_id,
          user_name: m.user_name,
          credits_used: m.credits_used,
          call_count: m.call_count
        }))
      };
    })
  );

  // 按部门聚合本月报销（count / total / pending）
  const deptReimbMap: Record<string, DeptReimbursementSummary> = {};
  const monthStartIso = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
  ).toISOString();
  for (const r of reimbList.rows) {
    if (!r.department_id) continue;
    const inMonth =
      r.status === "approved"
        ? (r.reviewed_at ?? r.created_at) >= monthStartIso
        : r.created_at >= monthStartIso;
    if (!inMonth) continue;
    const s = deptReimbMap[r.department_id] ?? {
      count: 0,
      total_cny: 0,
      pending_count: 0
    };
    s.count++;
    if (r.status === "approved") s.total_cny += Number(r.amount_cny) || 0;
    if (r.status === "pending") s.pending_count++;
    deptReimbMap[r.department_id] = s;
  }

  // 部门 趋势数据 — 每部门 × 4 个 range（7d/30d/季度/年）
  // 后端 getDailyTrend 返回每个桶（日/周/月）的总 credits，不分 type
  // 用部门级图/视频积分比例做拆分（与 admin Credit context 同方法）
  // 待后端补按 type 拆分的 trend 数据后替换
  type DeptTrendPoint = {
    d: string;
    img: number;
    vid: number;
    imgCredits?: number;
    vidCredits?: number;
  };

  function pointsToTrendData(
    points: TrendPoint[],
    imgCredits: number,
    vidCredits: number
  ): DeptTrendPoint[] {
    const totalC = imgCredits + vidCredits || 1;
    const imgRatio = imgCredits / totalC;
    return points.map((p) => {
      const imgC = Math.round(p.credits * imgRatio);
      const vidC = Math.max(0, p.credits - imgC);
      const imgCount = Math.round(imgC / PROFILE_FIXTURE.imgPtsPerCount);
      const vidCount = Math.round(vidC / PROFILE_FIXTURE.vidPtsPerCount);
      return {
        d: p.date.length >= 10 ? p.date.slice(5) : p.date,
        img: imgCount,
        vid: vidCount,
        imgCredits: imgC,
        vidCredits: vidC
      };
    });
  }

  const deptTrendMap: Record<string, Record<TrendRange, DeptTrendPoint[]>> = {};
  await Promise.all(
    deptDetails.map(async (d) => {
      const trendArr = await Promise.all(
        ALL_TREND_RANGES.map((r) => getDailyTrend(RANGE_TO_DATE[r], d.dept_id))
      );
      const m = ALL_TREND_RANGES.reduce<Record<TrendRange, DeptTrendPoint[]>>(
        (acc, r, i) => {
          // 稀疏时填充演示值（让 demo 阶段图表呈现自然形态）
          const filled = fillSparseTrend(trendArr[i]);
          acc[r] = pointsToTrendData(filled, d.image_credits, d.video_credits);
          return acc;
        },
        {} as Record<TrendRange, DeptTrendPoint[]>
      );
      deptTrendMap[d.dept_id] = m;
    })
  );

  // 埋点：tab=detail 时单独记一条，2 周后与 admin_view_collections 比对得出
  // PromptCollectionsPanel 的"曝光 → 互动"转化率，用于决定该面板留 / 下沉 / 删
  await writeAuditLog({
    user_id: user.id,
    action: "admin_view_dashboard",
    metadata: { range: "month", view: "v2", tab: defaultTab }
  });

  const detailSlot = (
    <>
      <section>
        <h3 className="text-body font-semibold text-text mb-3">最近任务记录</h3>
        <TaskRecordsPanel
          initialRows={taskInitial.rows}
          initialTotal={taskInitial.total}
          filterOpts={taskFilterOpts}
          defaultDeptId={presetDeptId}
          defaultUserId={presetUserId}
          defaultUserName={presetUserName}
        />
      </section>
      <section>
        <h3 className="text-body font-semibold text-text mb-3">Prompt 收藏监控</h3>
        <PromptCollectionsPanel
          initialRows={collectionInitial.rows}
          initialStats={collectionInitial.stats}
          initialTotal={collectionInitial.total}
          filterOpts={collectionFilterOpts}
        />
      </section>
    </>
  );

  return (
    <AdminView
      kpi={kpi}
      totalUsers={totalUsers}
      alerts={alerts}
      todoBreakdown={todoBreakdown}
      multiTrendMap={multiTrendMap}
      deptCross={deptCross}
      purposeCross={purposeCross}
      reimbStats={reimbStats}
      spend={spend}
      modelTopMom={modelTopMom}
      deptDetails={deptDetails}
      deptReimbMap={deptReimbMap}
      deptTrendMap={deptTrendMap}
      detailSlot={detailSlot}
      defaultTab={defaultTab}
      defaultFocus={defaultFocus}
      defaultDeptId={presetDeptId}
      insightsUrgent={insights.urgent}
      insightsNormalCount={Math.max(0, insights.activeCount - insights.urgent.length)}
      insightsActiveCount={insights.activeCount}
      insightsActiveByCategory={insights.activeByCategory}
      insightsUrgentAlerts={insights.urgentAlerts}
      insightsActiveAlertCount={insights.activeAlertCount}
      insightsActiveSignalCount={insights.activeSignalCount}
    />
  );
}
