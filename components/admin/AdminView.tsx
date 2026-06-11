"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  KPI,
  Tabs,
  TrendChart,
  BarChart,
  GroupedBarChart,
  StatMini,
  CountUp,
  RangeToggle,
  SubRangePicker,
  ChartTypeToggle,
  rangePrimary,
  fmtInt,
  type ChartType,
  type KpiData,
  type TabItem,
  type TrendRange
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import type {
  AdminKpi,
  AdminAlert,
  DeptUsageCrossRow,
  MultiTrend,
  PurposeUsageCrossRow,
  ReimbursementStats,
  SpendBreakdown
} from "@/lib/db/queries";
import { formatTodoFoot, type TodoBreakdown } from "@/lib/admin/todos";
import {
  SPEND_QUAD_FIXTURE,
  TOOL_TOP_FIXTURE,
  DEPT_SPEND_FIXTURE,
  purposeColor
} from "@/lib/fixtures/admin";
import { DeptOverviewPanel, type DeptDetail } from "./DeptOverviewPanel";
import { DeptDetailPanel, type DeptReimbursementSummary } from "./DeptDetailPanel";
import { DemoBadge, EstimateBadge } from "./DataBadges";
import { InsightsBanner } from "./InsightsBanner";
import { ModelDetailExpansion } from "./ModelDetailExpansion";
import type { Insight, InsightCategory } from "@/lib/admin/insights/types";

// /admin 数据看板（V2 ViewAdmin，来源：原型设计V2/_extract/src/view-admin.jsx）
// 两 tab：总览（master-detail）/ 明细
// 明细 tab 嵌入现有 TaskRecordsPanel / PromptCollectionsPanel（保留）

type ModelTopMomRow = {
  model_name: string;
  count: number;
  credits: number;
  /** 上月积分；用于双柱对比可视化（NEW 时为 0） */
  prev_credits: number;
  /** 环比上月 %（null = 上月无该模型，is_new=true） */
  mom_pct: number | null;
  is_new: boolean;
};

type TrendDataPoint = {
  d: string;
  img: number;
  vid: number;
  imgCredits?: number;
  vidCredits?: number;
};

interface Props {
  kpi: AdminKpi;
  totalUsers: number;
  alerts: AdminAlert[];
  todoBreakdown: TodoBreakdown;
  /** 全公司 4 个 range 的多线趋势（key = range） */
  multiTrendMap: Record<TrendRange, MultiTrend>;
  deptCross: DeptUsageCrossRow[];
  purposeCross: PurposeUsageCrossRow[];
  /** 模型异动（含环比 delta），由 admin/page.tsx 通过本月 + 上月查询合成 */
  modelTopMom: ModelTopMomRow[];
  reimbStats: ReimbursementStats;
  spend: SpendBreakdown;
  /** 部门 tab 数据 */
  deptDetails: DeptDetail[];
  /** 各部门当月报销汇总（key = dept_id） */
  deptReimbMap: Record<string, DeptReimbursementSummary>;
  /** 各部门 × 4 range 的趋势数据 */
  deptTrendMap: Record<string, Record<TrendRange, TrendDataPoint[]>>;
  /** 已渲染的明细 tab 内容（嵌入现有 TaskRecordsPanel / PromptCollectionsPanel） */
  detailSlot: React.ReactNode;
  /** URL 初始 tab；省略时默认 overview */
  defaultTab?: "overview" | "detail";
  /** URL 初始 KPI focus（来自 AI 洞察 evidence 跳转） */
  defaultFocus?: "credit" | "spend" | "dept";
  /** URL 预选的部门（focus=dept 时生效） */
  defaultDeptId?: string;
  /** 首屏告警条：紧急洞察 top N */
  insightsUrgent: Insight[];
  insightsNormalCount: number;
  insightsActiveCount: number;
  /** 按分类的 active 计数，banner 头部角标用 */
  insightsActiveByCategory: Record<InsightCategory, number>;
  /** alert 类紧急（admin 真正要立即处理的）— banner 主区只显示这些 */
  insightsUrgentAlerts: Insight[];
  /** alert 类 active 总数 */
  insightsActiveAlertCount: number;
  /** signal 类 active 总数（banner 右下弱链接显示） */
  insightsActiveSignalCount: number;
}

type AdminTab = "overview" | "detail";

export function AdminView(props: Props) {
  const [tab, setTab] = useState<AdminTab>(props.defaultTab ?? "overview");
  const tabs: TabItem<AdminTab>[] = [
    { value: "overview", label: "总览", icon: "chart" },
    { value: "detail", label: "明细查询", icon: "history" }
  ];

  return (
    <div className="page" data-screen-label={`Admin · ${tab}`}>
      <div className="crumb">
        <span>管理</span>
        <Icon name="chev" size={10} className="sep" />
        <span style={{ color: "var(--text-2)" }}>数据看板</span>
      </div>
      <div className="page-head">
        <div>
          <div className="page-title">数据看板</div>
          <div className="page-subtitle">
            本月 · 截至 {todayLabel()}
            <span
              className="chip"
              style={{ marginLeft: 8, background: "var(--success-soft)", color: "var(--success)" }}
            >
              实时
            </span>
          </div>
        </div>
      </div>

      <InsightsBanner
        urgent={props.insightsUrgentAlerts}
        normalCount={Math.max(
          0,
          props.insightsActiveAlertCount - props.insightsUrgentAlerts.length
        )}
        activeCount={props.insightsActiveAlertCount}
        activeByCategory={props.insightsActiveByCategory}
        signalCount={props.insightsActiveSignalCount}
      />

      <Tabs value={tab} onChange={setTab} items={tabs} />

      <div className="mt-4 fade-in" key={tab}>
        {tab === "overview" && (
          <OverviewPanel
            kpi={props.kpi}
            totalUsers={props.totalUsers}
            alerts={props.alerts}
            todoBreakdown={props.todoBreakdown}
            multiTrendMap={props.multiTrendMap}
            deptCross={props.deptCross}
            purposeCross={props.purposeCross}
            modelTopMom={props.modelTopMom}
            reimbStats={props.reimbStats}
            spend={props.spend}
            deptDetails={props.deptDetails}
            deptReimbMap={props.deptReimbMap}
            deptTrendMap={props.deptTrendMap}
            defaultFocus={props.defaultFocus}
            defaultDeptId={props.defaultDeptId}
          />
        )}
        {tab === "detail" && <div className="space-y-4">{props.detailSlot}</div>}
      </div>
    </div>
  );
}

// ─── Overview（master-detail）───────────────────────────────

function OverviewPanel({
  kpi,
  totalUsers,
  alerts,
  todoBreakdown,
  multiTrendMap,
  deptCross,
  purposeCross,
  modelTopMom,
  reimbStats,
  spend,
  deptDetails,
  deptReimbMap,
  deptTrendMap,
  defaultFocus,
  defaultDeptId
}: Pick<
  Props,
  | "kpi"
  | "totalUsers"
  | "alerts"
  | "todoBreakdown"
  | "multiTrendMap"
  | "deptCross"
  | "purposeCross"
  | "modelTopMom"
  | "reimbStats"
  | "spend"
  | "deptDetails"
  | "deptReimbMap"
  | "deptTrendMap"
  | "defaultFocus"
  | "defaultDeptId"
>) {
  type Focus = "credit" | "spend" | "dept";
  // 来自 AI 洞察 evidence 跳转：?focus=dept&dept=<id> 直接定位到部门详情
  const [focus, setFocus] = useState<Focus>(defaultFocus ?? "credit");
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(
    defaultFocus === "dept" ? defaultDeptId ?? null : null
  );

  // 从总览的"部门用量明细"表跳到 dept focus 并指向具体部门
  const onGotoDept = (deptId: string | null) => {
    setSelectedDeptId(deptId);
    setFocus("dept");
  };

  const callsDelta =
    kpi.prev_total_calls != null && kpi.prev_total_calls > 0
      ? Math.round(((kpi.total_calls - kpi.prev_total_calls) / kpi.prev_total_calls) * 1000) / 10
      : null;
  const creditsDelta =
    kpi.prev_total_credits_consumed != null && kpi.prev_total_credits_consumed > 0
      ? Math.round(
          ((kpi.total_credits_consumed - kpi.prev_total_credits_consumed) /
            kpi.prev_total_credits_consumed) *
            1000
        ) / 10
      : null;
  const reimbDelta =
    kpi.prev_total_reimbursement_cny != null && kpi.prev_total_reimbursement_cny > 0
      ? Math.round(
          ((kpi.total_reimbursement_cny - kpi.prev_total_reimbursement_cny) /
            kpi.prev_total_reimbursement_cny) *
            1000
        ) / 10
      : null;

  // 第三卡改"部门看板"：value=活跃部门数 / 总数；foot 含告警计数
  const activeDeptCount = deptDetails.filter(
    (d) => d.active_member_count > 0 || d.total_credits > 0
  ).length;
  const overQuotaCount = deptDetails.filter((d) => d.usage_ratio >= 1).length;
  const nearQuotaCount = deptDetails.filter(
    (d) => d.usage_ratio >= 0.85 && d.usage_ratio < 1
  ).length;
  // foot 文案分级：超额优先告警，否则显示临近上限，最后才是中性的"全员"
  let deptFoot: string;
  if (overQuotaCount > 0) {
    deptFoot = `${overQuotaCount} 个部门超额 · ${nearQuotaCount} 临近上限`;
  } else if (nearQuotaCount > 0) {
    deptFoot = `${nearQuotaCount} 个临近上限 · 活跃成员 ${kpi.active_users}`;
  } else {
    deptFoot = `活跃成员 ${kpi.active_users} · 全员 ${totalUsers}`;
  }

  const kpis: KpiData[] = [
    {
      key: "credit",
      label: "本月调用积分",
      value: kpi.total_credits_consumed,
      unit: "积分",
      delta: creditsDelta != null ? Math.abs(creditsDelta) : undefined,
      deltaDir: creditsDelta == null ? "flat" : creditsDelta >= 0 ? "up" : "down",
      prev: kpi.prev_total_credits_consumed ?? undefined,
      prevLabel: "上月",
      icon: "zap",
      accent: "accent"
    },
    {
      key: "spend",
      label: "本月报销总额",
      value: kpi.total_reimbursement_cny,
      isPrefix: true,
      delta: reimbDelta != null ? Math.abs(reimbDelta) : undefined,
      deltaDir: reimbDelta == null ? "flat" : reimbDelta >= 0 ? "up" : "down",
      prev: kpi.prev_total_reimbursement_cny ?? undefined,
      prevLabel: "上月",
      icon: "receipt",
      accent: "violet"
    },
    {
      key: "dept",
      label: "活跃部门",
      value: activeDeptCount,
      // 单位改成"/ 总部门数"，让数字更有上下文（如"4 / 9 部门"）
      unit: `/ ${deptDetails.length} 部门`,
      delta: undefined,
      foot: deptFoot,
      icon: "building",
      // 超额 → warn 黄色 + attention 边框；临近 → 仍 success 但 foot 含黄字提示
      accent: overQuotaCount > 0 ? "warn" : "success",
      attention: overQuotaCount > 0
    },
    {
      key: "todo",
      label: "待处理事项",
      value: todoBreakdown.total,
      unit: "项",
      // total > 0 才 attention；为 0 时降级（避免空时仍是红色边框）
      attention: todoBreakdown.total > 0,
      link: true,
      foot: formatTodoFoot(todoBreakdown),
      icon: "alert",
      accent: todoBreakdown.total > 0 ? "warn" : "success"
    }
  ];

  // 模块标题：与下方 KPI 卡的 grid 列对齐
  // - credit/spend/dept：focus 切换型 → active 主色 + 圆点 + KPI 卡下三角指向 context-panel
  // - todo：动作型 → 用短横线占位（与"待处理事项"大标题不重复）
  type ModuleTitle =
    | { key: Focus; label: string; kind: "focus" }
    | { key: "todo"; label: string; kind: "placeholder" };
  const moduleTitles: ModuleTitle[] = [
    { key: "credit", label: "用量分析", kind: "focus" },
    { key: "spend", label: "报销支出", kind: "focus" },
    { key: "dept", label: "部门看板", kind: "focus" },
    { key: "todo", label: "—", kind: "placeholder" }
  ];

  return (
    <>
      {/* 模块标题行 — 与下方 kpi-row 同 grid 列对齐 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 8,
          paddingLeft: 4
        }}
      >
        {moduleTitles.map((m) => {
          const active = m.kind === "focus" && focus === m.key;
          const interactive = m.kind === "focus";
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                if (m.kind === "focus") {
                  setFocus(m.key);
                  // 切回 dept focus 时清空"已选部门"，回到列表态
                  if (m.key === "dept") setSelectedDeptId(null);
                }
              }}
              disabled={!interactive}
              style={{
                background: "transparent",
                border: "none",
                padding: "2px 0 4px",
                textAlign: "left",
                cursor: interactive ? "pointer" : "default",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                letterSpacing: "-0.005em",
                color: active
                  ? "var(--accent-ink)"
                  : m.kind === "placeholder"
                    ? "var(--text-4)"
                    : "var(--text-2)",
                transition: "color .15s"
              }}
            >
              {active && (
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "var(--accent)",
                    boxShadow: "0 0 0 3px var(--accent-soft)"
                  }}
                />
              )}
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="kpi-row" style={{ marginBottom: 0 }}>
        {kpis.map((k) => {
          if (k.key === "credit" || k.key === "spend" || k.key === "dept") {
            const fk = k.key as Focus;
            return (
              <KPI
                key={k.key}
                k={k}
                selectable
                active={focus === fk}
                onClick={() => {
                  setFocus(fk);
                  if (fk === "dept") setSelectedDeptId(null);
                }}
              />
            );
          }
          if (k.link) {
            return (
              <KPI
                key={k.key}
                k={k}
                onClick={() => {
                  window.location.href = "/manage";
                }}
              />
            );
          }
          return <KPI key={k.key} k={k} />;
        })}
      </div>

      <div className="context-panel fade-in" key={focus}>
        {focus === "credit" && (
          <CreditContext
            multiTrendMap={multiTrendMap}
            deptCross={deptCross}
            purposeCross={purposeCross}
            modelTopMom={modelTopMom}
            onGotoDept={onGotoDept}
          />
        )}
        {focus === "spend" && <SpendContext spend={spend} reimbStats={reimbStats} />}
        {focus === "dept" && (
          <DeptContext
            deptDetails={deptDetails}
            deptReimbMap={deptReimbMap}
            deptTrendMap={deptTrendMap}
            selectedDeptId={selectedDeptId}
            onSelectedChange={setSelectedDeptId}
          />
        )}
      </div>

      {/* "需要关注" alert 区已移除（user: 与待处理事项 KPI、部门看板告警 redundant） */}
    </>
  );
}

// ─── Credit context ───────────────────────────────────────────

function CreditContext({
  multiTrendMap,
  deptCross,
  purposeCross,
  modelTopMom,
  onGotoDept
}: {
  multiTrendMap: Record<TrendRange, MultiTrend>;
  deptCross: DeptUsageCrossRow[];
  purposeCross: PurposeUsageCrossRow[];
  modelTopMom: ModelTopMomRow[];
  onGotoDept: (deptId: string) => void;
}) {
  const [range, setRange] = useState<TrendRange>("30d");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // 部门用量明细：用量(credits, 默认) ↔ 次数(count) 视图切换
  const [deptMetric, setDeptMetric] = useState<"credits" | "count">("credits");
  const multiTrend = multiTrendMap[range];
  // 切换 primary（日→其它）时，自动把图表形态切到更合适的默认：日→线，其它→柱
  // 但保留用户当前会话的明确选择
  // 这里用一个 effect 同步：当 range 变化且 primary 也变化时重置 chartType
  // （为简单起见，每次 range 变化时检查 primary）

  // 把 multiTrend (按部门拆色) 聚合成每桶总积分；按 type 拆分目前后端不支持，
  // 用 deptCross 的图/视频比例 × 每桶总数粗略拆出双线。
  const trendData = useMemo(() => {
    const totalsByKey = new Map<string, number>();
    for (const s of multiTrend.series) {
      for (const p of s.points) {
        totalsByKey.set(p.key, (totalsByKey.get(p.key) ?? 0) + p.credits);
      }
    }
    const sumImg = deptCross.reduce((s, r) => s + r.image_credits, 0);
    const sumVid = deptCross.reduce((s, r) => s + r.video_credits, 0);
    const total = sumImg + sumVid || 1;
    const imgRatio = sumImg / total;
    return multiTrend.bucket_keys.map((k) => {
      const totalC = totalsByKey.get(k) ?? 0;
      const img = Math.round(totalC * imgRatio);
      const vid = Math.max(0, totalC - img);
      return {
        d: shortLabel(k),
        img,
        vid,
        // 给 DualBarChart 当 hover tooltip 用（柱状模式下展示积分）
        imgCredits: img,
        vidCredits: vid
      };
    });
  }, [multiTrend, deptCross]);

  const series = [
    { key: "img", color: "var(--accent)", label: "图片" },
    { key: "vid", color: "var(--violet)", label: "视频" }
  ];
  // primary 变化 → 自动给 chartType 一个建议默认（日→线，其它→柱）
  // 但仍尊重用户明确切换的偏好
  const lastPrimaryRef = useRef(rangePrimary(range));
  useEffect(() => {
    const p = rangePrimary(range);
    if (p !== lastPrimaryRef.current) {
      lastPrimaryRef.current = p;
      setChartType(p === "day" ? "line" : "bar");
    }
  }, [range]);
  const useBar = chartType === "bar";

  // 按当前 metric 排序 + 取最大值给条形参照
  const sortedDept = useMemo(
    () =>
      [...deptCross].sort((a, b) =>
        deptMetric === "credits"
          ? b.total_credits - a.total_credits
          : b.total_count - a.total_count
      ),
    [deptCross, deptMetric]
  );
  const maxDept =
    deptMetric === "credits"
      ? sortedDept[0]?.total_credits || 1
      : sortedDept[0]?.total_count || 1;
  const purposeTotal = purposeCross.reduce((s, p) => s + p.total_count, 0) || 1;
  const sortedPurpose = [...purposeCross].sort((a, b) => b.total_count - a.total_count).slice(0, 6);
  // 排序切换：按用量 / 按涨幅
  // 按涨幅时：NEW 置顶（按本月用量降序），其余按 mom_pct 降序
  const [modelSort, setModelSort] = useState<"credits" | "mom">("credits");
  const [modelPage, setModelPage] = useState(0);
  // 模型异动行内展开（点击行展开按需 fetch 详情）
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  // 首次访问 + 列表非空时自动展开 top 1，引导发现"可点击"
  // admin 一旦手动折叠过就 localStorage 记下，下次不再自动展开（避免打扰）
  const [autoExpandDone, setAutoExpandDone] = useState(false);
  useEffect(() => {
    if (autoExpandDone) return;
    if (typeof window === "undefined") return;
    try {
      const collapsed = localStorage.getItem("admin:model-mom:user-collapsed") === "1";
      if (!collapsed && sortedModelsMomAll.length > 0) {
        setExpandedModel(sortedModelsMomAll[0].model_name);
      }
    } catch {
      /* ignore */
    }
    setAutoExpandDone(true);
    // 仅首次 mount 时触发；列表内容变化（modelSort）不重新自动展开
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const MODEL_PAGE_SIZE = 5;

  const sortedModelsMomAll = useMemo(() => {
    const arr = [...modelTopMom];
    if (modelSort === "mom") {
      // 按涨幅：先按 mom_pct 降序排非 NEW；NEW 模型移到末尾（按本月用量降序，前后呈现分组）
      arr.sort((a, b) => {
        if (a.is_new && b.is_new) return b.credits - a.credits;
        if (a.is_new) return 1; // NEW 往后排
        if (b.is_new) return -1;
        return (b.mom_pct ?? 0) - (a.mom_pct ?? 0);
      });
    } else {
      arr.sort((a, b) => b.credits - a.credits);
    }
    return arr;
  }, [modelTopMom, modelSort]);

  const modelTotalPages = Math.max(
    1,
    Math.ceil(sortedModelsMomAll.length / MODEL_PAGE_SIZE)
  );
  // 切换排序时回到第一页
  useEffect(() => {
    setModelPage(0);
  }, [modelSort]);
  // 越界保护
  const safeModelPage = Math.min(modelPage, modelTotalPages - 1);
  const sortedModelsMom = sortedModelsMomAll.slice(
    safeModelPage * MODEL_PAGE_SIZE,
    (safeModelPage + 1) * MODEL_PAGE_SIZE
  );

  // 双柱对比共享 y 轴最大值（用全部数据的最大值，让跨页对比也稳定）
  const momMaxCredits = Math.max(
    1,
    ...sortedModelsMomAll.flatMap((m) => [m.credits, m.prev_credits])
  );

  return (
    <>
      <div className="context-panel-head">
        <div className="context-panel-title">
          <span className="dot" />
          <Icon name="trend" size={15} style={{ color: "var(--accent)" }} />
          趋势图
          <SubRangePicker value={range} onChange={setRange} />
        </div>
        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          <div className="flex items-center gap-3" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                {s.label}
              </span>
            ))}
            <EstimateBadge reason="图/视频拆分按部门月度比例反推每桶总积分，非真实 by_type 数据。待后端补 image_credits / video_credits 字段后切真值" />
          </div>
          <RangeToggle value={range} onChange={setRange} />
          <ChartTypeToggle value={chartType} onChange={setChartType} />
        </div>
      </div>

      <div style={{ position: "relative" }}>
        {!useBar && hoverIdx != null && trendData[hoverIdx] && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: -4,
              display: "flex",
              gap: 10,
              fontSize: 11.5,
              fontFamily: "var(--font-mono)",
              color: "var(--text-2)",
              background: "var(--card)",
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              zIndex: 2
            }}
          >
            <span>{trendData[hoverIdx].d}</span>
            <span>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                {trendData[hoverIdx].img}
              </span>{" "}
              图
            </span>
            <span>
              <span style={{ color: "var(--violet)", fontWeight: 600 }}>
                {trendData[hoverIdx].vid}
              </span>{" "}
              视
            </span>
          </div>
        )}
        {useBar ? (
          <GroupedBarChart data={trendData} height={220} />
        ) : (
          <TrendChart
            data={trendData}
            series={series}
            hoverIndex={hoverIdx}
            onHoverIndex={setHoverIdx}
            height={200}
          />
        )}
      </div>

      {/* 部门用量明细（含 次数/用量 toggle + 行点击跳转部门看板）*/}
      <div className="mt-6">
        <div className="section-head" style={{ marginBottom: 8 }}>
          <div className="section-title" style={{ fontSize: 13.5 }}>
            <Icon name="building" size={13} style={{ color: "var(--violet)" }} />
            部门用量明细
            <span
              className="t-cap"
              style={{
                marginLeft: 6,
                color: "var(--text-3)",
                textTransform: "none",
                fontSize: 11
              }}
            >
              · 点行进入部门看板
            </span>
          </div>
          {/* 次数 / 用量 滑块切换 */}
          <div className="seg-btns">
            <span
              className={`seg-btn ${deptMetric === "credits" ? "active" : ""}`}
              onClick={() => setDeptMetric("credits")}
              role="button"
              tabIndex={0}
            >
              用量
            </span>
            <span
              className={`seg-btn ${deptMetric === "count" ? "active" : ""}`}
              onClick={() => setDeptMetric("count")}
              role="button"
              tabIndex={0}
            >
              次数
            </span>
          </div>
        </div>
        {sortedDept.length === 0 ? (
          <EmptyHint>暂无部门数据</EmptyHint>
        ) : (
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>部门</th>
                <th style={{ textAlign: "right" }}>图片</th>
                <th style={{ textAlign: "right" }}>视频</th>
                <th style={{ textAlign: "right" }}>总计</th>
                <th>占比</th>
              </tr>
            </thead>
            <tbody>
              {sortedDept.map((d) => {
                const img = deptMetric === "credits" ? d.image_credits : d.image_count;
                const vid = deptMetric === "credits" ? d.video_credits : d.video_count;
                const total = deptMetric === "credits" ? d.total_credits : d.total_count;
                const share = (total / maxDept) * 100;
                return (
                  <tr
                    key={d.department_id}
                    onClick={() => onGotoDept(d.department_id)}
                    style={{ cursor: "pointer" }}
                    title={`查看 ${d.department_name} 部门看板`}
                  >
                    <td className="fw-5">{d.department_name}</td>
                    <td className="col-num">
                      <span className="num">{fmtInt(img)}</span>
                    </td>
                    <td className="col-num">
                      <span
                        style={{
                          color: vid === 0 ? "var(--text-4)" : "inherit"
                        }}
                      >
                        <span className="num">{fmtInt(vid)}</span>
                      </span>
                    </td>
                    <td className="col-num fw-6">
                      <span className="num">{fmtInt(total)}</span>
                    </td>
                    <td style={{ width: 180 }}>
                      <div className="flex items-center gap-2">
                        <div className="bar" style={{ flex: 1 }}>
                          <div
                            className="bar-fill accent"
                            style={{ width: Math.min(100, share) + "%" }}
                          />
                        </div>
                        <span
                          className="num"
                          style={{
                            fontSize: 11.5,
                            color: "var(--text-2)",
                            minWidth: 36,
                            textAlign: "right"
                          }}
                        >
                          {share.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 模型异动 · 整行（admin 主决策区，给充足横向空间） */}
      <div className="mt-6">
        <div className="card" style={{ padding: "22px 24px 14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginBottom: 4
            }}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                fontFamily: "var(--font-display)"
              }}
            >
              模型异动
            </div>
            <div className="seg-btns">
              <span
                className={`seg-btn ${modelSort === "credits" ? "active" : ""}`}
                onClick={() => setModelSort("credits")}
                role="button"
                tabIndex={0}
              >
                按用量
              </span>
              <span
                className={`seg-btn ${modelSort === "mom" ? "active" : ""}`}
                onClick={() => setModelSort("mom")}
                role="button"
                tabIndex={0}
              >
                按涨幅
              </span>
            </div>
          </div>
          <div
            className="t-cap"
            style={{
              textTransform: "none",
              fontSize: 11,
              color: "var(--text-3)",
              marginBottom: 12
            }}
          >
            上月 vs 本月 双柱对比 · 含 NEW / 涨跌标记
          </div>
          {sortedModelsMomAll.length === 0 ? (
            <EmptyHint>暂无模型数据</EmptyHint>
          ) : (
            <>
              <div>
                {sortedModelsMom.map((m, i) => {
                  const globalIdx = safeModelPage * MODEL_PAGE_SIZE + i;
                  // 在按涨幅排序下，NEW 与非 NEW 之间插入分隔
                  const prev = i > 0 ? sortedModelsMom[i - 1] : null;
                  const showNewSeparator =
                    modelSort === "mom" && m.is_new && prev && !prev.is_new;
                  return (
                    <div key={m.model_name}>
                      {showNewSeparator && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "14px 0 8px",
                            borderTop: "1px dashed var(--border-strong)",
                            color: "var(--text-3)",
                            fontSize: 11,
                            fontWeight: 500,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase"
                          }}
                        >
                          <span
                            style={{
                              flexShrink: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4
                            }}
                          >
                            <span
                              className="chip"
                              style={{
                                height: 17,
                                padding: "0 6px",
                                fontSize: 10,
                                background: "var(--success-soft)",
                                color: "var(--success)",
                                fontWeight: 600
                              }}
                            >
                              NEW
                            </span>
                            <span>本月新增模型 · 无上月环比</span>
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedModel((cur) => {
                            const next = cur === m.model_name ? null : m.model_name;
                            // admin 主动折叠 → 记忆，下次不再自动展开 top 1
                            if (next === null && typeof window !== "undefined") {
                              try {
                                localStorage.setItem("admin:model-mom:user-collapsed", "1");
                              } catch {
                                /* ignore */
                              }
                            }
                            return next;
                          });
                        }}
                        aria-expanded={expandedModel === m.model_name}
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          padding: "14px 0",
                          borderTop:
                            i === 0 || showNewSeparator
                              ? "none"
                              : "1px solid var(--border)",
                          fontSize: 14,
                          gap: 12,
                          display: "flex",
                          alignItems: "center",
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "background .15s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "color-mix(in srgb, var(--bg) 60%, transparent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <span
                          className="num"
                          style={{
                            width: 28,
                            color: "var(--text-3)",
                            fontSize: 13,
                            flexShrink: 0
                          }}
                        >
                          {String(globalIdx + 1).padStart(2, "0")}
                        </span>
                        <MiniBarPair
                          current={m.credits}
                          prev={m.prev_credits}
                          max={momMaxCredits}
                        />
                        <span
                          style={{
                            flex: 1,
                            color: "var(--text)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {m.model_name}
                          </span>
                          <MomBadge mom={m} />
                        </span>
                        <span
                          className="num fw-6"
                          style={{
                            color: "var(--text)",
                            fontSize: 13.5,
                            flexShrink: 0
                          }}
                        >
                          {fmtInt(m.credits)}
                        </span>
                        <Icon
                          name="chevDown"
                          size={11}
                          style={{
                            color: "var(--text-3)",
                            transform:
                              expandedModel === m.model_name
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                            transition: "transform .2s",
                            flexShrink: 0,
                            marginLeft: 4
                          }}
                        />
                      </button>
                      {expandedModel === m.model_name && (
                        <div
                          style={{
                            borderRadius: 8,
                            marginBottom: 8,
                            overflow: "hidden",
                            border: "1px solid var(--border)"
                          }}
                        >
                          <ModelDetailExpansion modelName={m.model_name} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 分页 footer — 仅 > 1 页时显示 */}
              {modelTotalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 0 4px",
                    borderTop: "1px solid var(--border)",
                    marginTop: 8
                  }}
                >
                  <span
                    className="t-cap"
                    style={{
                      textTransform: "none",
                      fontSize: 11,
                      color: "var(--text-3)"
                    }}
                  >
                    共 {sortedModelsMomAll.length} 个模型
                  </span>
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <PagerBtn
                      disabled={safeModelPage === 0}
                      onClick={() => setModelPage((p) => Math.max(0, p - 1))}
                      label="上一页"
                    >
                      ‹
                    </PagerBtn>
                    <span
                      className="num"
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-2)",
                        padding: "0 6px",
                        minWidth: 36,
                        textAlign: "center"
                      }}
                    >
                      {safeModelPage + 1} / {modelTotalPages}
                    </span>
                    <PagerBtn
                      disabled={safeModelPage >= modelTotalPages - 1}
                      onClick={() =>
                        setModelPage((p) => Math.min(modelTotalPages - 1, p + 1))
                      }
                      label="下一页"
                    >
                      ›
                    </PagerBtn>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 使用目的分布 · 紧凑单行水平堆叠条
          admin 一眼了解"公司在用 AI 干嘛"；细节下钻已经在模型异动展开的"按用途"里 */}
      <div className="mt-4" id="purposes" style={{ scrollMarginTop: 80 }}>
        <div className="card" style={{ padding: "14px 18px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: sortedPurpose.length === 0 ? 0 : 10
            }}
          >
            <Icon name="tag" size={14} style={{ color: "var(--violet)" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              使用目的分布
            </span>
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              本月 · 共 <span className="num fw-6">{fmtInt(purposeTotal)}</span> 次
            </span>
          </div>
          {sortedPurpose.length === 0 ? (
            <EmptyHint>暂无目的数据</EmptyHint>
          ) : (
            <>
              {/* 水平堆叠条 */}
              <div
                style={{
                  display: "flex",
                  height: 8,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: "var(--border)",
                  marginBottom: 10
                }}
              >
                {sortedPurpose.map((p, i) => {
                  const share = (p.total_count / purposeTotal) * 100;
                  return (
                    <div
                      key={p.purpose_tag_name}
                      style={{
                        width: `${share}%`,
                        background: purposeColor(i),
                        transition: "width .3s"
                      }}
                      title={`${p.purpose_tag_name} · ${share.toFixed(1)}% · ${fmtInt(p.total_count)} 次`}
                    />
                  );
                })}
              </div>
              {/* legend chip 行 */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px 18px",
                  fontSize: 12
                }}
              >
                {sortedPurpose.map((p, i) => {
                  const share = (p.total_count / purposeTotal) * 100;
                  return (
                    <span
                      key={p.purpose_tag_name}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: purposeColor(i),
                          flexShrink: 0
                        }}
                      />
                      <span style={{ color: "var(--text-2)" }}>{p.purpose_tag_name}</span>
                      <span
                        className="num"
                        style={{ color: "var(--text)", fontWeight: 600 }}
                      >
                        {share.toFixed(1)}%
                      </span>
                      <span className="num" style={{ color: "var(--text-3)" }}>
                        · {fmtInt(p.total_count)} 次
                      </span>
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Spend context ───────────────────────────────────────────

function SpendContext({
  spend,
  reimbStats
}: {
  spend: SpendBreakdown;
  reimbStats: ReimbursementStats;
}) {
  const totalSpend = Math.round(
    spend.reimb_subscription_cny + spend.reimb_api_topup_cny + spend.reimb_other_cny
  );

  return (
    <>
      <div className="context-panel-head">
        <div className="context-panel-title">
          <span className="dot" />
          <Icon name="receipt" size={15} style={{ color: "var(--violet)" }} />
          报销总额 · 工具支出
        </div>
      </div>

      {/* spend hero gradient + stat quad */}
      <div className="grid mb-6" style={{ gridTemplateColumns: "1.3fr 1fr", gap: 14 }}>
        <div className="spend-hero">
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="spend-hero-label">本月报销总额</div>
            <div className="spend-hero-num">
              ¥<CountUp value={totalSpend} fmt={fmtInt} />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span
                style={{
                  background: "rgba(255,255,255,.18)",
                  padding: "2px 7px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500
                }}
              >
                {reimbStats.total_count} 笔
              </span>
              <span style={{ fontSize: 11.5, opacity: 0.8 }}>
                订阅 ¥{fmtInt(spend.reimb_subscription_cny)} · API ¥
                {fmtInt(spend.reimb_api_topup_cny)}
              </span>
            </div>
          </div>
        </div>

        {/* 精简：原 4 个 stat-mini 砍掉"平均单据"+"人均支出"（可从单据总数 + 报销人数 + 总额数学推算，信息冗余）
            保留两个"主源数据"：单据总数 + 报销人数。布局改成 1×2 高度同步，与左侧 hero 卡平衡
            注：这两块当前是 fixture，等后端 ReimbursementStats 补 reimburser_count 字段后接入。 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center"
            }}
          >
            <DemoBadge reason="单据总数 / 报销人数当前为 fixture，待后端 reimburser_count 字段就位后切换" />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateRows: "1fr 1fr",
              gap: 8,
              flex: 1
            }}
          >
            <StatMini
              label="单据总数"
              value={SPEND_QUAD_FIXTURE.invoiceCount.value}
              dotColor="var(--accent)"
              foot={SPEND_QUAD_FIXTURE.invoiceCount.foot}
            />
            <StatMini
              label="报销人数"
              value={SPEND_QUAD_FIXTURE.reimbursers.value}
              dotColor="var(--success)"
              foot={SPEND_QUAD_FIXTURE.reimbursers.foot}
            />
          </div>
        </div>
      </div>

      {/* Tool Top */}
      <div className="mt-6">
        <div className="section-head" style={{ marginBottom: 8 }}>
          <div className="section-title" style={{ fontSize: 13.5 }}>
            <Icon name="bolt" size={13} style={{ color: "var(--violet)" }} />
            工具 Top · 按报销金额
            <DemoBadge reason="工具 Top 列表当前是 8 条 fixture，待后端 by_tool 补 category / user_count / share_pct 字段后接入" />
          </div>
          <span className="section-hint">本月 · ¥</span>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th>工具</th>
                <th>分类</th>
                <th style={{ textAlign: "right" }}>使用人数</th>
                <th>占比</th>
                <th style={{ textAlign: "right" }}>金额</th>
              </tr>
            </thead>
            <tbody>
              {TOOL_TOP_FIXTURE.map((t, i) => (
                <tr key={t.name}>
                  <td style={{ color: "var(--text-3)" }}>
                    <span className="num">{String(i + 1).padStart(2, "0")}</span>
                  </td>
                  <td className="fw-5">{t.name}</td>
                  <td>
                    <span className="chip">{t.kind}</span>
                  </td>
                  <td className="col-num">
                    <span className="num">{t.users}</span> 人
                  </td>
                  <td style={{ width: 200 }}>
                    <div className="flex items-center gap-2">
                      <div className="bar" style={{ flex: 1 }}>
                        <div
                          className="bar-fill"
                          style={{
                            width: Math.min(100, t.share * 3.5) + "%",
                            background: "linear-gradient(90deg, #FF9D7C, #FFC97B)"
                          }}
                        />
                      </div>
                      <span
                        className="num"
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-2)",
                          minWidth: 36,
                          textAlign: "right"
                        }}
                      >
                        {t.share.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="col-num text-right">
                    <span className="num fw-6">¥{fmtInt(t.amount)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid mt-6" style={{ gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <div>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <div className="section-title" style={{ fontSize: 13.5 }}>
              <Icon name="building" size={13} /> 部门支出
              <DemoBadge reason="部门支出当前为 fixture，待后端 by_dept 补 member_count / share_pct 字段后接入" />
            </div>
          </div>
          <table className="table" style={{ fontSize: 13 }}>
            <tbody>
              {DEPT_SPEND_FIXTURE.map((d) => (
                <tr key={d.dept}>
                  <td className="fw-5">{d.dept}</td>
                  <td style={{ color: "var(--text-3)" }}>
                    <span className="num">{d.count}</span>人
                  </td>
                  <td style={{ width: 130 }}>
                    <div className="bar">
                      <div
                        className="bar-fill"
                        style={{
                          width: Math.min(100, d.share * 2.5) + "%",
                          background: "linear-gradient(90deg, #FF9D7C, #FFC97B)"
                        }}
                      />
                    </div>
                  </td>
                  <td className="col-num text-right">
                    <span className="num fw-6">¥{fmtInt(d.spend)}</span>
                    <span style={{ color: "var(--text-3)", marginLeft: 6 }} className="num">
                      {d.share}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <div className="section-title" style={{ fontSize: 13.5 }}>
              <Icon name="trend" size={13} /> 近 6 月报销趋势
            </div>
            <span className="section-hint">¥ · 已通过</span>
          </div>
          {reimbStats.by_month.length > 0 ? (
            <BarChart
              data={reimbStats.by_month.map((m) => ({
                d: shortMonthLabel(m.month),
                v: Math.round(m.total_cny)
              }))}
              color="var(--violet)"
              height={170}
            />
          ) : (
            <EmptyHint>近 6 月暂无已通过的报销记录</EmptyHint>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Dept context ─────────────────────────────────────────────
// 在 .context-panel 内部呈现：列表态 / 详情态二选一
// 与 Credit/Spend Context 视觉节奏一致：先 .context-panel-head 标题，再主体

function DeptContext({
  deptDetails,
  deptReimbMap,
  deptTrendMap,
  selectedDeptId,
  onSelectedChange
}: {
  deptDetails: DeptDetail[];
  deptReimbMap: Record<string, DeptReimbursementSummary>;
  deptTrendMap: Record<string, Record<TrendRange, TrendDataPoint[]>>;
  selectedDeptId: string | null;
  onSelectedChange: (id: string | null) => void;
}) {
  const selected = selectedDeptId
    ? deptDetails.find((d) => d.dept_id === selectedDeptId)
    : null;

  return (
    <>
      <div className="context-panel-head">
        <div className="context-panel-title">
          <span className="dot" />
          <Icon name="building" size={15} style={{ color: "var(--accent)" }} />
          部门看板 · {selected ? selected.dept_name : "全公司部门"}
        </div>
        <div className="flex items-center gap-2">
          {selected ? (
            <button
              type="button"
              onClick={() => onSelectedChange(null)}
              className="btn btn-ghost btn-sm"
              title="返回部门列表"
            >
              <Icon name="chevLeft" size={11} />
              返回部门列表
            </button>
          ) : (
            <span
              className="t-cap"
              style={{ textTransform: "none", color: "var(--text-3)", fontSize: 11.5 }}
            >
              数据范围 · 本月 · 共 {deptDetails.length} 部门
            </span>
          )}
        </div>
      </div>

      {selected ? (
        <DeptDetailPanel
          dept={selected}
          reimb={
            deptReimbMap[selected.dept_id] ?? {
              count: 0,
              total_cny: 0,
              pending_count: 0
            }
          }
          trendMap={
            deptTrendMap[selected.dept_id] ?? {
              "7d": [],
              "30d": [],
              quarter: [],
              year: []
            }
          }
          onBack={() => onSelectedChange(null)}
        />
      ) : (
        <DeptOverviewPanel depts={deptDetails} onOpenDept={onSelectedChange} />
      )}
    </>
  );
}

// 通用分页按钮（用在模型异动 footer）
function PagerBtn({
  disabled,
  onClick,
  label,
  children
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--card)",
        color: "var(--text-2)",
        fontSize: 14,
        lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color .15s, color .15s"
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = "var(--border-strong)";
          e.currentTarget.style.color = "var(--text)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-2)";
      }}
    >
      {children}
    </button>
  );
}

// 双柱对比：上月（灰）vs 本月（主色），共享 y 轴最大值
function MiniBarPair({
  current,
  prev,
  max
}: {
  current: number;
  prev: number;
  max: number;
}) {
  const W = 26;
  const H = 22;
  const barW = 8;
  const gap = 2;
  const totalBars = barW * 2 + gap;
  const offsetX = (W - totalBars) / 2;
  const hPrev = max > 0 ? (prev / max) * H : 0;
  const hCurrent = max > 0 ? (current / max) * H : 0;
  // NEW 时上月为 0 → 留一根极矮的灰底条暗示"上月空"，避免视觉只剩一根柱孤立
  const minTrace = 2;
  const displayHPrev = prev === 0 && current > 0 ? minTrace : hPrev;
  const isPrevTrace = prev === 0 && current > 0;
  return (
    <svg width={W} height={H} style={{ flexShrink: 0, display: "block" }} aria-hidden>
      <rect
        x={offsetX}
        y={H - displayHPrev}
        width={barW}
        height={Math.max(0, displayHPrev)}
        rx={1.5}
        fill={isPrevTrace ? "var(--border-strong)" : "var(--text-4)"}
        opacity={isPrevTrace ? 0.6 : 0.8}
      />
      <rect
        x={offsetX + barW + gap}
        y={H - hCurrent}
        width={barW}
        height={Math.max(0, hCurrent)}
        rx={1.5}
        fill={current > prev ? "var(--accent)" : current < prev ? "var(--text-3)" : "var(--accent)"}
      />
    </svg>
  );
}

// 模型异动徽章：NEW / +X% / -X%
function MomBadge({ mom }: { mom: ModelTopMomRow }) {
  if (mom.is_new) {
    return (
      <span
        className="chip"
        style={{
          height: 18,
          padding: "0 6px",
          fontSize: 10,
          background: "var(--success-soft)",
          color: "var(--success)",
          fontWeight: 600,
          letterSpacing: "0.04em",
          flexShrink: 0
        }}
      >
        NEW
      </span>
    );
  }
  if (mom.mom_pct == null || Math.abs(mom.mom_pct) < 5) return null;
  const up = mom.mom_pct > 0;
  return (
    <span
      className={`delta ${up ? "delta-up" : "delta-down"}`}
      style={{ fontSize: 10, padding: "0 5px", flexShrink: 0 }}
    >
      {up ? "↑" : "↓"} {Math.abs(mom.mom_pct).toFixed(0)}%
    </span>
  );
}

function todayLabel(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="card card-pad text-center"
      style={{ color: "var(--text-3)", padding: "32px 16px", fontSize: 13 }}
    >
      {children}
    </div>
  );
}

function shortLabel(key: string): string {
  // bucket_keys 可能形态：
  //   日：YYYY-MM-DD  → "MM.DD"
  //   月：YYYY-MM     → "YY.MM"
  //   季：YYYY-Qn     → "YY Q1"
  //   年：YYYY        → "YYYY"
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const parts = key.split("-");
    return `${parts[1]}.${parts[2]}`;
  }
  if (/^\d{4}-Q\d$/.test(key)) {
    const parts = key.split("-Q");
    return `${parts[0].slice(2)} Q${parts[1]}`;
  }
  if (/^\d{4}-\d{2}$/.test(key)) {
    const parts = key.split("-");
    return `${parts[0].slice(2)}.${parts[1]}`;
  }
  if (/^\d{4}$/.test(key)) {
    return key;
  }
  return key;
}

function shortMonthLabel(monthKey: string): string {
  // "YYYY-MM" 或 "YYYY-MM-DD" 都接受
  const m = monthKey.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[2]}月`;
  return monthKey;
}
