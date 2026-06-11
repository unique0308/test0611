"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  ChartTypeToggle,
  KPI,
  RangeToggle,
  SubRangePicker,
  TrendChart,
  fmtInt,
  rangePrimary,
  type ChartType,
  type KpiData,
  type TrendRange
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import type { AdminKpi, TrendPoint, DeptMemberRow } from "@/lib/db/queries";

// /manager/dashboard · V2 视觉外壳
// 4 个 KPI + 30 日趋势 + 员工排行（DeptMemberTable 复用既有）
// 既有 ManagerQuotaCard / DeptMemberTable / ModuleDistribution 通过 detailSlot 嵌入

interface Props {
  deptName: string;
  kpi: AdminKpi;
  creditsUsed: number;
  creditsLimit: number;
  /** 4 range 的趋势数据（每桶 credits 总数；本视角不分图/视频） */
  trendMap: Record<TrendRange, TrendPoint[]>;
  members: DeptMemberRow[];
  /** 既有 ManagerQuotaCard / DeptMemberTable / ModuleDistribution 等 */
  belowTrendSlot: React.ReactNode;
}

export function ManagerView({
  deptName,
  kpi,
  creditsUsed,
  creditsLimit,
  trendMap,
  members,
  belowTrendSlot
}: Props) {
  const [range, setRange] = useState<TrendRange>("30d");
  const [chartType, setChartType] = useState<ChartType>("line");
  const trend = trendMap[range] ?? [];
  const useBar = chartType === "bar";
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const lastPrimaryRef = useRef(rangePrimary(range));
  useEffect(() => {
    const p = rangePrimary(range);
    if (p !== lastPrimaryRef.current) {
      lastPrimaryRef.current = p;
      setChartType(p === "day" ? "line" : "bar");
    }
  }, [range]);

  const usagePct = creditsLimit > 0 ? Math.round((creditsUsed / creditsLimit) * 100) : 0;
  const usageAccent: KpiData["accent"] =
    usagePct >= 100 ? "warn" : usagePct >= 80 ? "warn" : "violet";

  // KPI 3 卡（合并）：积分消耗合并了"本月调用次数"作 foot 一并显示，
  // 因为一次生成同时 +1 调用 +X 积分，两卡走势同步、信号冗余。
  const kpis: KpiData[] = [
    {
      key: "credits",
      label: `${deptName} · 本月积分消耗`,
      value: kpi.total_credits_consumed,
      unit: "积分",
      foot: `${fmtInt(kpi.total_calls)} 次调用 · ≈ ¥ ${kpi.total_cny.toFixed(2)}`,
      icon: "bolt",
      accent: "violet"
    },
    {
      key: "users",
      label: "本部门活跃员工",
      value: kpi.active_users,
      unit: "人",
      foot: `共 ${members.length} 成员`,
      icon: "user",
      accent: "success"
    },
    {
      key: "quota",
      label: "本月配额使用率",
      value: usagePct,
      unit: "%",
      attention: usagePct >= 80,
      foot: `${fmtInt(creditsUsed)} / ${fmtInt(creditsLimit)} 积分`,
      icon: "shield",
      accent: usageAccent
    }
  ];

  // trend points → 两种形态都用 { d, v }/{ d, credits } 兼容
  const trendData = useMemo(
    () =>
      trend.map((p) => ({
        d: shortLabel(p.date),
        credits: p.credits,
        v: p.credits
      })),
    [trend]
  );

  return (
    <div className="page" data-screen-label={`Manager · ${deptName}`}>
      <div className="crumb">
        <span>管理</span>
        <Icon name="chev" size={10} className="sep" />
        <span style={{ color: "var(--text-2)" }}>部门看板</span>
      </div>
      <div className="page-head">
        <div>
          <div className="page-title flex items-center gap-2">
            {deptName}
            <span className="role-pill manager">
              <span style={{ width: 4, height: 4, borderRadius: 999, background: "currentColor" }} />
              部门负责人
            </span>
          </div>
          <div className="page-subtitle">数据范围本月 · 自然月 1 号起</div>
        </div>
      </div>

      <div className="kpi-row">
        {kpis.map((k) => (
          <KPI key={k.key} k={k} />
        ))}
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">
            <Icon name="trend" size={13} style={{ color: "var(--accent)" }} />
            趋势图
            <SubRangePicker value={range} onChange={setRange} />
          </div>
          <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
            <RangeToggle value={range} onChange={setRange} />
            <ChartTypeToggle value={chartType} onChange={setChartType} />
          </div>
        </div>
        <div className="card card-pad">
          {trendData.length === 0 ? (
            <div className="py-10 text-center t-sub" style={{ color: "var(--text-3)" }}>
              所选时间段暂无数据
            </div>
          ) : useBar ? (
            <BarChart data={trendData} color="var(--accent)" height={220} />
          ) : (
            <TrendChart
              data={trendData}
              series={[{ key: "credits", color: "var(--accent)", label: "积分" }]}
              hoverIndex={hoverIdx}
              onHoverIndex={setHoverIdx}
              height={220}
            />
          )}
        </div>
      </div>

      <div className="space-y-4">{belowTrendSlot}</div>
    </div>
  );
}

function shortLabel(key: string): string {
  // bucket_keys 形态：日 / 月 / 季 / 年
  if (/^\d{4}-\d{2}-\d{2}/.test(key)) {
    const parts = key.slice(0, 10).split("-");
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
  if (/^\d{4}$/.test(key)) return key;
  return key;
}
