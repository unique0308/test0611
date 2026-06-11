"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import {
  GroupedBarChart,
  RangeToggle,
  SubRangePicker,
  ChartTypeToggle,
  TrendChart,
  fmtInt,
  rangePrimary,
  type ChartType,
  type KpiData,
  type TrendRange
} from "@/components/ui/primitives";
import { purposeColor } from "@/lib/fixtures/admin";
import type { DeptDetail } from "./DeptOverviewPanel";
import { DeptMemberSpike } from "@/components/manager/DeptMemberSpike";

// 部门看板 详情态（态 B） — 单部门下钻视图
// 来源：用户审视确认后的精简版（去掉成员搜索、独立报销表、独立快捷操作行）
// 数据：dept (含 purposes/models/top_members) + 当月该部门报销（按 dept_id 过滤后传入）

export interface DeptReimbursementSummary {
  count: number;
  total_cny: number;
  pending_count: number;
}

interface Props {
  dept: DeptDetail;
  reimb: DeptReimbursementSummary;
  /** 该部门 × 4 range 的趋势数据（按图/视频拆分；后端 daily 数据按 type 拆缺失时由 page 估算） */
  trendMap: Record<TrendRange, Array<{ d: string; img: number; vid: number; imgCredits?: number; vidCredits?: number }>>;
  /** 返回列表回调（外层 context-panel-head 已处理，本组件内不再使用） */
  onBack?: () => void;
}

type MemberSort = "credits" | "count";

// 月名缩写
const MONTH_LABEL = (key: string): string => {
  const m = key.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}月` : key;
};

type QuotaHistoryRow = {
  month: string;
  credits_used: number;
  credits_limit: number;
  usage_ratio: number;
};

export function DeptDetailPanel({ dept, reimb, trendMap }: Props) {
  const router = useRouter();
  const [memberSort, setMemberSort] = useState<MemberSort>("credits");
  const [range, setRange] = useState<TrendRange>("30d");
  const [chartType, setChartType] = useState<ChartType>("line");
  // 近 6 月使用率历史 — 按需 client fetch（避免 SSR 时给每个部门都查）
  const [quotaHistory, setQuotaHistory] = useState<QuotaHistoryRow[] | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/admin/dept-quota-history?dept_id=${encodeURIComponent(dept.dept_id)}&months=6`, {
      signal: ac.signal
    })
      .then((r) => r.json())
      .then((d) => setQuotaHistory(d.rows ?? []))
      .catch(() => {});
    return () => ac.abort();
  }, [dept.dept_id]);
  // KPI inline stat 单元格 hover 索引（state 驱动，避免依赖被 disabled 吞掉 mouseenter）
  const [hoverKpiIdx, setHoverKpiIdx] = useState<number | null>(null);
  const trend = trendMap[range] ?? [];
  const useBar = chartType === "bar";
  const lastPrimaryRef = useRef(rangePrimary(range));
  useEffect(() => {
    const p = rangePrimary(range);
    if (p !== lastPrimaryRef.current) {
      lastPrimaryRef.current = p;
      setChartType(p === "day" ? "line" : "bar");
    }
  }, [range]);

  // KPI 4 卡（最后一张点击跳 /manage 该部门报销）
  const usagePct = dept.credits_limit > 0 ? Math.round((dept.usage_ratio) * 100) : 0;
  const usageAccent: KpiData["accent"] =
    usagePct >= 100 ? "warn" : usagePct >= 85 ? "warn" : "violet";
  const usageFoot =
    dept.credits_limit > 0
      ? `${fmtInt(dept.total_credits)} / ${fmtInt(dept.credits_limit)}`
      : "未设置配额";

  // 配额使用率 KPI 现在是行动入口（点击跳 /manage?tab=quota）→ 加 link 提示
  // 本月调用积分 KPI 也变可点（跳到该部门 dept-filtered detail），充当"任务记录"入口
  const kpis: KpiData[] = [
    {
      key: "credits",
      label: "本月调用积分",
      value: dept.total_credits,
      unit: "积分",
      icon: "zap",
      accent: "accent",
      foot: `图 ${fmtInt(dept.image_credits)} · 视 ${fmtInt(dept.video_credits)}`,
      link: true,
      linkLabel: "查看任务记录",
      linkColor: "var(--accent-ink)"
    },
    {
      key: "quota",
      label: "配额使用率",
      value: usagePct,
      unit: "%",
      icon: "shield",
      accent: usageAccent,
      attention: usagePct >= 85,
      foot: usageFoot,
      link: true,
      linkLabel: usagePct >= 100 ? "调整配额" : usagePct >= 85 ? "调整配额" : "调整配额",
      linkColor: usagePct >= 85 ? "var(--warn)" : "var(--accent-ink)"
    },
    {
      key: "members",
      label: "活跃成员",
      value: dept.active_member_count,
      unit: "人",
      icon: "user",
      accent: "success",
      foot: `成员 ${dept.member_count}`
    },
    {
      key: "reimb",
      label: "本月报销",
      value: Math.round(reimb.total_cny),
      isPrefix: true,
      icon: "receipt",
      accent: "violet",
      foot:
        reimb.pending_count > 0
          ? `${reimb.count} 笔 · ${reimb.pending_count} 待审`
          : `${reimb.count} 笔`,
      link: true,
      linkLabel: reimb.pending_count > 0 ? "前往审核" : "查看报销",
      linkColor: reimb.pending_count > 0 ? "var(--warn)" : "var(--accent-ink)"
    }
  ];

  // 成员排序
  const sortedMembers = useMemo(() => {
    const arr = [...dept.top_members];
    if (memberSort === "credits") arr.sort((a, b) => b.credits_used - a.credits_used);
    else arr.sort((a, b) => b.call_count - a.call_count);
    return arr;
  }, [dept.top_members, memberSort]);

  // 配额超额预测：算"日均消耗"和"预测超额日"。仅在 30d 趋势 + 有配额 + 当前未超额时计算
  const forecastInfo = useMemo(() => {
    if (range !== "30d") return null;
    if (dept.credits_limit <= 0) return null;
    if (dept.total_credits >= dept.credits_limit) return null;
    const now = new Date();
    const daysElapsed = now.getUTCDate();
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
    ).getUTCDate();
    const daysRemaining = daysInMonth - daysElapsed;
    if (daysElapsed < 3) return null;
    const dailyAvg = dept.total_credits / daysElapsed;
    const remainingCredits = dept.credits_limit - dept.total_credits;
    const daysUntilOver = remainingCredits / Math.max(1, dailyAvg);
    const overshootDay =
      daysUntilOver <= daysRemaining
        ? Math.ceil(daysElapsed + daysUntilOver)
        : null;
    return { dailyAvg, daysRemaining, overshootDay, daysInMonth };
  }, [range, dept.credits_limit, dept.total_credits]);

  // 给 TrendChart 的 forecast 数据：当 30d 单线模式时，沿日均斜率向后画到月末
  // 注：当前是双线（图/视频），forecast 段按当前比例拆给两条线
  const forecastData = useMemo(() => {
    if (!forecastInfo) return undefined;
    if (range !== "30d") return undefined;
    if (trend.length === 0) return undefined;
    // 按当前图/视频比例分摊未来日均
    const imgRatio =
      dept.total_credits > 0 ? dept.image_credits / dept.total_credits : 0.5;
    const vidRatio = 1 - imgRatio;
    const dailyAvg = forecastInfo.dailyAvg;
    const out = [];
    const today = new Date();
    for (let i = 1; i <= forecastInfo.daysRemaining; i++) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() + i);
      const label = `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
      out.push({
        d: label,
        img: Math.round(dailyAvg * imgRatio),
        vid: Math.round(dailyAvg * vidRatio)
      });
    }
    return out;
  }, [forecastInfo, range, trend.length, dept.image_credits, dept.total_credits]);

  // 目的细分 & 模型细分
  const purposeTotal = dept.purposes.reduce((s, p) => s + p.count, 0) || 1;
  const modelMaxCredits = dept.models[0]?.credits || 1;

  // 成员排行表的"占部门比例"基准值
  const memberShareBase =
    memberSort === "credits"
      ? dept.top_members.reduce((s, m) => s + m.credits_used, 0)
      : dept.top_members.reduce((s, m) => s + m.call_count, 0);

  return (
    <div className="fade-in">
      {/* 4 KPI 改成"部门 inline stat 横条"形态，与上层总览 4 大卡视觉明确区分（避免"本月调用积分"两层混淆）
          每格：[部门名] · [指标名] / 大数值 / foot / 操作 link
          配额超额时该格背景渐变 warn-soft 暖色提示 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--card)",
          overflow: "hidden",
          boxShadow: "var(--sh-sm)"
        }}
      >
        {kpis.map((k, i) => {
          const isCredits = k.key === "credits";
          const isQuota = k.key === "quota";
          const isReimb = k.key === "reimb";
          const isClickable = isCredits || isQuota || isReimb;
          const attention = isQuota && usagePct >= 85;
          const handleClick = () => {
            if (isCredits) {
              window.location.href = `/admin?tab=detail&dept=${encodeURIComponent(dept.dept_id)}`;
            } else if (isQuota) {
              window.location.href = `/manage?tab=quota&dept=${encodeURIComponent(dept.dept_id)}`;
            } else if (isReimb) {
              window.location.href = `/manage?tab=audit&dept=${encodeURIComponent(dept.dept_id)}`;
            }
          };

          // 主数值颜色：配额超额时染 warn 强化告警；其余沿用 text 主色
          const numColor =
            isQuota && usagePct >= 100
              ? "var(--danger)"
              : isQuota && usagePct >= 85
                ? "var(--warn)"
                : "var(--text)";

          const isHovered = hoverKpiIdx === i && isClickable;

          // 背景：保持原态不动（attention 渐变常在；普通格透明）
          // hover 反馈：① 微微上提 ② 色泽柔光（accent 或 warn glow）③ 不动 bg / 不画 ring，避免视觉躁动
          const background = attention
            ? "linear-gradient(180deg, var(--warn-soft) 0%, var(--card) 70%)"
            : "transparent";

          const hoverGlow = attention
            ? "0 6px 20px -8px rgba(217,119,6,.28), 0 1px 2px rgba(217,119,6,.10)"
            : "0 6px 20px -8px var(--accent-glow), 0 1px 2px rgba(99,102,241,.08)";

          return (
            <button
              key={k.key}
              type="button"
              onClick={isClickable ? handleClick : undefined}
              onMouseEnter={() => isClickable && setHoverKpiIdx(i)}
              onMouseLeave={() => setHoverKpiIdx(null)}
              aria-disabled={!isClickable}
              style={{
                padding: "16px 18px 14px",
                textAlign: "left",
                border: "none",
                borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                background,
                cursor: isClickable ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                transition: "transform .18s ease, box-shadow .22s ease",
                position: "relative",
                // 上提 + 色泽光晕；不动背景色，视觉舒服
                transform: isHovered ? "translateY(-2px)" : "none",
                boxShadow: isHovered ? hoverGlow : "none",
                borderRadius: isHovered ? 8 : 0,
                zIndex: isHovered ? 1 : "auto"
              }}
            >
              {/* 部门前缀 + 指标名 */}
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--text-3)",
                  letterSpacing: "-0.002em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                <span
                  style={{
                    color: "var(--accent-ink)",
                    fontWeight: 600,
                    marginRight: 4
                  }}
                >
                  {dept.dept_name}
                </span>
                <span style={{ color: "var(--text-4)" }}>·</span>{" "}
                <span>{k.label}</span>
              </div>

              {/* 主数值 + 单位 */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span
                  className="num"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                    color: numColor
                  }}
                >
                  {k.isPrefix ? (k.prefix ?? "¥") : ""}
                  {fmtInt(k.value)}
                </span>
                {k.unit && !k.isPrefix && (
                  <span
                    className="num"
                    style={{ fontSize: 12, color: "var(--text-3)" }}
                  >
                    {k.unit}
                  </span>
                )}
              </div>

              {/* foot */}
              {k.foot && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-3)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {k.foot}
                </div>
              )}

              {/* 操作 link */}
              {k.link && k.linkLabel && (
                <div
                  style={{
                    fontSize: 11,
                    color: k.linkColor ?? "var(--accent-ink)",
                    fontWeight: 500,
                    marginTop: 2,
                    whiteSpace: "nowrap"
                  }}
                >
                  {k.linkLabel} →
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 趋势图（通栏） */}
      <div className="section" style={{ marginTop: 22 }}>
        <div className="section-head">
          <div className="section-title" style={{ fontSize: 13.5 }}>
            <Icon name="trend" size={13} style={{ color: "var(--accent)" }} />
            趋势图
            <SubRangePicker value={range} onChange={setRange} />
          </div>
          <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
            <div
              className="flex items-center gap-3"
              style={{ fontSize: 11.5, color: "var(--text-3)" }}
            >
              <span className="flex items-center gap-1">
                <span
                  style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent)" }}
                />
                图片
              </span>
              <span className="flex items-center gap-1">
                <span
                  style={{ width: 8, height: 8, borderRadius: 2, background: "var(--violet)" }}
                />
                视频
              </span>
            </div>
            <RangeToggle value={range} onChange={setRange} />
            <ChartTypeToggle value={chartType} onChange={setChartType} />
          </div>
        </div>
        <div className="card card-pad">
          {trend.length === 0 || trend.every((d) => d.img + d.vid === 0) ? (
            <div className="py-10 text-center t-sub" style={{ color: "var(--text-3)" }}>
              所选时间段暂无数据
            </div>
          ) : useBar ? (
            <GroupedBarChart data={trend} height={220} />
          ) : (
            <TrendChart
              data={trend}
              series={[
                { key: "img", color: "var(--accent)", label: "图片" },
                { key: "vid", color: "var(--violet)", label: "视频" }
              ]}
              height={220}
              forecastData={forecastData}
            />
          )}
        </div>

        {/* 配额累计 + 预测结论行（仅 30d 模式 + 有配额时显示） */}
        {range === "30d" && dept.credits_limit > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 14px",
              background: "var(--bg)",
              borderRadius: 8,
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <span style={{ color: "var(--text-3)" }}>本月累计</span>
            <div
              style={{
                flex: "1 1 200px",
                minWidth: 160,
                height: 8,
                borderRadius: 999,
                background: "var(--border)",
                overflow: "hidden",
                position: "relative"
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, usagePct)}%`,
                  height: "100%",
                  background:
                    usagePct >= 100
                      ? "var(--danger)"
                      : usagePct >= 85
                        ? "var(--warn)"
                        : "var(--accent)",
                  transition: "width .3s"
                }}
              />
            </div>
            <span className="num" style={{ color: "var(--text)", fontWeight: 600 }}>
              {fmtInt(dept.total_credits)} / {fmtInt(dept.credits_limit)}
            </span>
            <span style={{ color: "var(--text-3)" }}>·</span>
            {forecastInfo ? (
              forecastInfo.overshootDay ? (
                <span style={{ color: "var(--danger)", fontWeight: 500 }}>
                  按日均 {Math.round(forecastInfo.dailyAvg).toLocaleString()} 积分速度，预计{" "}
                  {forecastInfo.overshootDay} 日触达上限
                </span>
              ) : (
                <span style={{ color: "var(--success)" }}>
                  按日均 {Math.round(forecastInfo.dailyAvg).toLocaleString()} 积分速度，本月可
                  控
                </span>
              )
            ) : usagePct >= 100 ? (
              <span style={{ color: "var(--danger)", fontWeight: 500 }}>已超额</span>
            ) : (
              <span style={{ color: "var(--text-3)" }}>剩 {fmtInt(dept.credits_limit - dept.total_credits)} 积分</span>
            )}
          </div>
        )}

        {/* 近 6 月使用率历史 mini bar — client fetch 后渲染 */}
        {quotaHistory && quotaHistory.length > 0 && (
          <div
            className="mt-4"
            style={{
              padding: "14px 16px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
                近 6 月使用率
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                平均{" "}
                <span className="num" style={{ color: "var(--text-2)", fontWeight: 600 }}>
                  {Math.round(
                    (quotaHistory.reduce((s, r) => s + r.usage_ratio, 0) /
                      quotaHistory.length) *
                      100
                  )}
                  %
                </span>
              </span>
              {(() => {
                const avg =
                  quotaHistory.reduce((s, r) => s + r.usage_ratio, 0) /
                  quotaHistory.length;
                if (avg < 0.3 && dept.credits_limit > 0) {
                  const suggested = Math.max(
                    500,
                    Math.round((dept.credits_limit * (avg + 0.1)) / 100) * 100
                  );
                  return (
                    <span style={{ fontSize: 11, color: "var(--warn)" }}>
                      · 建议下调至 ~{fmtInt(suggested)} 积分
                    </span>
                  );
                }
                if (avg > 0.95) {
                  const suggested =
                    Math.round((dept.credits_limit * 1.3) / 100) * 100;
                  return (
                    <span style={{ fontSize: 11, color: "var(--danger)" }}>
                      · 建议上调至 ~{fmtInt(suggested)} 积分
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 64 }}>
              {quotaHistory.map((m) => {
                const pct = Math.min(100, m.usage_ratio * 100);
                const tone =
                  pct >= 100
                    ? "var(--danger)"
                    : pct >= 85
                      ? "var(--warn)"
                      : pct < 30
                        ? "var(--text-4)"
                        : "var(--accent)";
                return (
                  <div
                    key={m.month}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      minWidth: 0
                    }}
                    title={`${m.month} · ${fmtInt(m.credits_used)} / ${fmtInt(m.credits_limit)} (${Math.round(pct)}%)`}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: 36,
                        position: "relative",
                        background: "var(--bg)",
                        borderRadius: 4,
                        overflow: "hidden"
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: `${pct}%`,
                          background: tone,
                          transition: "height .3s"
                        }}
                      />
                    </div>
                    <span
                      className="num"
                      style={{ fontSize: 10, color: "var(--text-3)" }}
                    >
                      {MONTH_LABEL(m.month)}
                    </span>
                    <span
                      className="num"
                      style={{ fontSize: 10, color: "var(--text-2)", fontWeight: 500 }}
                    >
                      {Math.round(pct)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 目的 + 模型 两栏 — 装饰展示风格 */}
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}
      >
        {/* 目的分布 */}
        <div className="card" style={{ padding: "22px 24px 26px" }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              marginBottom: 18,
              fontFamily: "var(--font-display)"
            }}
          >
            目的分布
          </div>
          {dept.purposes.length === 0 ? (
            <EmptyHint>本月暂无生成</EmptyHint>
          ) : (
            <div className="flex-col" style={{ gap: 18 }}>
              {dept.purposes.map((p, i) => {
                const share = (p.count / purposeTotal) * 100;
                return (
                  <div key={p.purpose_tag_name}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                        fontSize: 13.5
                      }}
                    >
                      <span
                        className="flex items-center"
                        style={{ gap: 8, fontWeight: 500, color: "var(--text)" }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 3,
                            background: purposeColor(i)
                          }}
                        />
                        {p.purpose_tag_name}
                      </span>
                      <span
                        className="num"
                        style={{ color: "var(--text-3)", fontSize: 12 }}
                      >
                        <span style={{ color: "var(--text-2)", fontWeight: 600 }}>
                          {share.toFixed(1)}%
                        </span>
                        <span style={{ marginLeft: 6 }}>· {fmtInt(p.count)} 次</span>
                      </span>
                    </div>
                    <div className="bar" style={{ height: 8 }}>
                      <div
                        className="bar-fill"
                        style={{ width: share + "%", background: purposeColor(i) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 模型偏好 */}
        <div className="card" style={{ padding: "22px 24px 26px" }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              marginBottom: 18,
              fontFamily: "var(--font-display)"
            }}
          >
            模型偏好
          </div>
          {dept.models.length === 0 ? (
            <EmptyHint>本月暂无调用</EmptyHint>
          ) : (
            <div className="flex-col" style={{ gap: 18 }}>
              {dept.models.map((m) => {
                const share = (m.credits / modelMaxCredits) * 100;
                return (
                  <div key={m.model_name}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                        fontSize: 13.5
                      }}
                    >
                      <span style={{ fontWeight: 500, color: "var(--text)" }}>
                        {m.model_name}
                      </span>
                      <span
                        className="num"
                        style={{ color: "var(--text-3)", fontSize: 12 }}
                      >
                        <span style={{ color: "var(--text-2)", fontWeight: 600 }}>
                          {fmtInt(m.credits)}
                        </span>
                        <span style={{ marginLeft: 6 }}>· {fmtInt(m.count)} 次</span>
                      </span>
                    </div>
                    <div className="bar" style={{ height: 8 }}>
                      <div
                        className="bar-fill"
                        style={{
                          width: share + "%",
                          background:
                            "linear-gradient(90deg, var(--violet), var(--accent-2))"
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 成员异动卡（本周 vs 上周）— admin 与 manager 共用 */}
      <div style={{ marginTop: 16 }}>
        <DeptMemberSpike
          deptId={dept.dept_id}
          deptName={dept.dept_name}
          onUserClick={(userId) =>
            router.push(`/admin?tab=detail&user=${encodeURIComponent(userId)}`)
          }
        />
      </div>

      {/* 成员排行 — 通栏可排序 · 行点击下钻到明细查询 */}
      <div className="section" id="members" style={{ marginTop: 0, scrollMarginTop: 80 }}>
        <div className="section-head">
          <div className="section-title" style={{ fontSize: 13.5 }}>
            <Icon name="user" size={13} style={{ color: "var(--success)" }} />
            成员排行 · 共 {dept.top_members.length} 人
            <span
              className="t-cap"
              style={{
                marginLeft: 6,
                color: "var(--text-3)",
                textTransform: "none",
                fontSize: 11
              }}
            >
              · 点行查看该成员任务明细
            </span>
          </div>
          <div className="seg-btns">
            <span
              className={`seg-btn ${memberSort === "credits" ? "active" : ""}`}
              onClick={() => setMemberSort("credits")}
              role="button"
              tabIndex={0}
            >
              按积分
            </span>
            <span
              className={`seg-btn ${memberSort === "count" ? "active" : ""}`}
              onClick={() => setMemberSort("count")}
              role="button"
              tabIndex={0}
            >
              按次数
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: 0 }}>
          {sortedMembers.length === 0 ? (
            <EmptyHint>暂无成员数据</EmptyHint>
          ) : (
            <table className="table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>成员</th>
                  <th
                    style={{
                      textAlign: "right",
                      color:
                        memberSort === "count" ? "var(--accent-ink)" : "var(--text-3)",
                      fontWeight: memberSort === "count" ? 700 : 600
                    }}
                  >
                    调用次数{memberSort === "count" && " ↓"}
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      color:
                        memberSort === "credits" ? "var(--accent-ink)" : "var(--text-3)",
                      fontWeight: memberSort === "credits" ? 700 : 600
                    }}
                  >
                    积分消耗{memberSort === "credits" && " ↓"}
                  </th>
                  <th style={{ width: 180 }}>
                    占部门比例
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        color: "var(--text-3)",
                        fontWeight: 500,
                        textTransform: "none",
                        letterSpacing: 0
                      }}
                    >
                      （按{memberSort === "credits" ? "积分" : "次数"}）
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((m, i) => {
                  const val = memberSort === "credits" ? m.credits_used : m.call_count;
                  const share = memberShareBase > 0 ? (val / memberShareBase) * 100 : 0;
                  // active 列：粗体、深色；非 active 列：弱化
                  const countCls = memberSort === "count" ? "fw-6" : "";
                  const creditsCls = memberSort === "credits" ? "fw-6" : "";
                  const countColor =
                    memberSort === "count" ? "var(--text)" : "var(--text-3)";
                  const creditsColor =
                    memberSort === "credits" ? "var(--text)" : "var(--text-3)";
                  return (
                    <tr
                      key={m.user_id}
                      onClick={() =>
                        router.push(
                          `/admin?tab=detail&user=${encodeURIComponent(m.user_id)}`
                        )
                      }
                      style={{ cursor: "pointer" }}
                      title={`查看 ${m.user_name} 的任务明细`}
                    >
                      <td style={{ color: "var(--text-3)" }}>
                        <span className="num">{String(i + 1).padStart(2, "0")}</span>
                      </td>
                      <td className="fw-5">{m.user_name}</td>
                      <td className={`col-num ${countCls}`} style={{ color: countColor }}>
                        <span className="num">{fmtInt(m.call_count)}</span>
                      </td>
                      <td className={`col-num ${creditsCls}`} style={{ color: creditsColor }}>
                        <span className="num">{fmtInt(m.credits_used)}</span>
                      </td>
                      <td>
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
                              minWidth: 40,
                              textAlign: "right",
                              fontWeight: 600
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
      </div>

      {/* 决策提示（与列表态一致语气，强化"用此页提配额/迭代策略"） */}
      <div
        className="t-cap"
        style={{
          textTransform: "none",
          marginTop: 12,
          color: "var(--text-3)",
          fontSize: 11
        }}
      >
        提示：配额接近上限可点上方"调整配额"；成员排行用于识别重度用户与活跃度；目的/模型分布可指导定制标签与模型授权。
      </div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "24px 16px",
        textAlign: "center",
        color: "var(--text-3)",
        fontSize: 12
      }}
    >
      {children}
    </div>
  );
}
