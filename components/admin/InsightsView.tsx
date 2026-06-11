"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icons";
import {
  CATEGORY_LABEL,
  type Insight,
  type InsightCategory,
  type InsightGroup,
  type InsightStatus
} from "@/lib/admin/insights/types";
import { ModelDetailExpansion } from "./ModelDetailExpansion";
import { QuotaInlineAdjust } from "./QuotaInlineAdjust";

// /admin/insights 视图 · 紧凑列表（方案 B）
// - 顶部双行 chip 过滤：第一行按分类，第二行按状态
// - 主区：单列折叠行；每行 icon + chip + title + 操作按钮
// - 点击行（除按钮）→ 行内展开 metrics + body + 建议 + evidence
// - URL hash 定位：/admin/insights#<insight.key> 进来时自动展开 + 滚动 + 高亮 2s

const CATEGORY_ICON: Record<InsightCategory, "shield" | "chart" | "receipt" | "user"> = {
  quota: "shield",
  model: "chart",
  spend: "receipt",
  user: "user"
};

const CATEGORY_COLOR: Record<InsightCategory, string> = {
  quota: "var(--violet)",
  model: "var(--accent)",
  spend: "var(--warn)",
  user: "var(--success)"
};

type FilterCat = "all" | InsightCategory;
type FilterStatus = "active" | "ignored" | "actioned";

type Props = {
  groups: InsightGroup[];
  activeCount: number;
};

export function InsightsView({ groups }: Props) {
  // 全量列表（来自 groups 展平）
  const allInsights = useMemo(() => groups.flatMap((g) => g.insights), [groups]);
  // alert（基于硬指标，admin 应处理）vs signal（观察性数据，仅参考）
  const [kindFilter, setKindFilter] = useState<"alert" | "signal">("alert");

  // 当前顶级 tab 下的洞察列表。分类/状态计数必须跟随这个口径，
  // 否则会出现“告警 0，但用户异常 1，列表为空”的错觉。
  const kindScopedInsights = useMemo(
    () => allInsights.filter((i) => i.kind === kindFilter),
    [allInsights, kindFilter]
  );

  // 分类计数（当前 kind + active 状态下）
  const catCounts = useMemo(() => {
    const map: Record<InsightCategory, number> = { quota: 0, model: 0, spend: 0, user: 0 };
    for (const it of kindScopedInsights) {
      if (it.status === "active") map[it.category]++;
    }
    return map;
  }, [kindScopedInsights]);

  // 状态计数（当前 kind 下）
  const statusCounts = useMemo(() => {
    const c = { active: 0, ignored: 0, actioned: 0 };
    for (const it of kindScopedInsights) c[it.status]++;
    return c;
  }, [kindScopedInsights]);

  const urgentActiveCount = useMemo(
    () => kindScopedInsights.filter((i) => i.severity === "urgent" && i.status === "active").length,
    [kindScopedInsights]
  );

  const [filterCat, setFilterCat] = useState<FilterCat | "urgent">("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("active");
  // 视图模式：按规则类型（默认）/ 按部门聚合
  const [viewMode, setViewMode] = useState<"by-rule" | "by-dept">("by-rule");

  // hash 定位：进入时如果有 #key，自动选定那条
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const decoded = decodeURIComponent(hash);
    setExpandedKey(decoded);
    setHighlightKey(decoded);
    // 渲染后滚动 + 2s 后取消高亮
    setTimeout(() => {
      const el = document.getElementById(`insight-${cssId(decoded)}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const t = setTimeout(() => setHighlightKey(null), 2500);
    return () => clearTimeout(t);
  }, []);

  // alert vs signal 计数
  const kindCounts = useMemo(() => {
    const c = { alert: 0, signal: 0 };
    for (const i of allInsights) {
      if (i.status === "active") c[i.kind]++;
    }
    return c;
  }, [allInsights]);

  // 过滤后的列表（当前 kind + filterCat + filterStatus）
  const filtered = useMemo(() => {
    return kindScopedInsights.filter((i) => {
      if (filterCat === "urgent") {
        if (i.severity !== "urgent") return false;
      } else if (filterCat !== "all") {
        if (i.category !== filterCat) return false;
      }
      if (i.status !== filterStatus) return false;
      return true;
    });
  }, [kindScopedInsights, filterCat, filterStatus]);

  // 按部门聚合（仅 viewMode=by-dept 时用）
  // 把 filtered insights 按 dept_id 分组；模型类（dept_id=null）归入"跨部门（模型）"
  const deptBuckets = useMemo(() => {
    if (viewMode !== "by-dept") return null;
    const map = new Map<
      string,
      { dept_id: string | null; dept_name: string; insights: Insight[] }
    >();
    for (const it of filtered) {
      const key = it.dept_id ?? "__cross_dept__";
      if (!map.has(key)) {
        map.set(key, {
          dept_id: it.dept_id ?? null,
          dept_name: it.dept_name ?? (it.dept_id ? "(未知)" : "跨部门（模型）"),
          insights: []
        });
      }
      map.get(key)!.insights.push(it);
    }
    // 排序：紧急多的部门置前，跨部门组放最后
    return [...map.values()].sort((a, b) => {
      if (a.dept_id === null && b.dept_id !== null) return 1;
      if (b.dept_id === null && a.dept_id !== null) return -1;
      const ua = a.insights.filter((i) => i.severity === "urgent").length;
      const ub = b.insights.filter((i) => i.severity === "urgent").length;
      if (ua !== ub) return ub - ua;
      return b.insights.length - a.insights.length;
    });
  }, [filtered, viewMode]);

  // 紧急区按"行动类型"分组（仅 alert + active + by-rule 视图）：用户异常 / 趋势预警 / 配额预警
  // signal 视图下不分组（数据信号本来就是参考性质，无"紧急"概念）
  const { urgentBuckets, normalInsights } = useMemo(() => {
    if (kindFilter === "signal") {
      return { urgentBuckets: null, normalInsights: filtered };
    }
    if (viewMode !== "by-rule") {
      return { urgentBuckets: null, normalInsights: filtered };
    }
    if (filterStatus !== "active") {
      return { urgentBuckets: null, normalInsights: filtered };
    }
    const urg = filtered.filter((i) => i.severity === "urgent");
    const nor = filtered.filter((i) => i.severity !== "urgent");
    if (urg.length === 0) {
      return { urgentBuckets: null, normalInsights: nor };
    }
    return {
      urgentBuckets: {
        user: urg.filter((i) => i.category === "user"),
        model: urg.filter((i) => i.category === "model"),
        quotaSpend: urg.filter((i) => i.category === "quota" || i.category === "spend")
      },
      normalInsights: nor
    };
  }, [filtered, filterStatus, viewMode, kindFilter]);

  return (
    <div className="page" data-screen-label="Admin Insights">
      <div className="crumb">
        <span>洞察</span>
        <Icon name="chev" size={10} className="sep" />
        <span style={{ color: "var(--text-2)" }}>AI 洞察</span>
      </div>
      <div className="page-head">
        <div>
          <div className="page-title">AI 洞察</div>
          <div className="page-subtitle">
            告警 <span className="num fw-6" style={{ color: kindCounts.alert > 0 ? "var(--danger)" : "var(--text-2)" }}>{kindCounts.alert}</span>
            <span style={{ color: "var(--text-3)" }}> · </span>
            数据信号 <span className="num fw-6" style={{ color: "var(--text-2)" }}>{kindCounts.signal}</span>
            {statusCounts.ignored + statusCounts.actioned > 0 && (
              <span style={{ color: "var(--text-3)", marginLeft: 8 }}>
                · {statusCounts.actioned} 已处理 · {statusCounts.ignored} 已忽略
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 告警 vs 数据信号 顶级切换 */}
      <div className="mt-4" style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
        <KindTab
          active={kindFilter === "alert"}
          label="告警"
          hint="基于硬指标（配额、产品配置）· admin 应处理"
          count={kindCounts.alert}
          tone="danger"
          onClick={() => setKindFilter("alert")}
        />
        <KindTab
          active={kindFilter === "signal"}
          label="数据信号"
          hint="基于环比/比例 · 仅供参考观察"
          count={kindCounts.signal}
          tone="neutral"
          onClick={() => setKindFilter("signal")}
        />
      </div>

      {/* 视图切换 + 过滤区 */}
      <div className="mt-4" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 视图模式 toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="t-cap"
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              textTransform: "none",
              width: 32,
              flexShrink: 0
            }}
          >
            视图
          </span>
          <div className="seg-btns">
            <span
              className={`seg-btn ${viewMode === "by-rule" ? "active" : ""}`}
              onClick={() => setViewMode("by-rule")}
              role="button"
              tabIndex={0}
            >
              按规则
            </span>
            <span
              className={`seg-btn ${viewMode === "by-dept" ? "active" : ""}`}
              onClick={() => setViewMode("by-dept")}
              role="button"
              tabIndex={0}
            >
              按部门
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              marginLeft: 6
            }}
          >
            {viewMode === "by-rule"
              ? "按规则类型 + 紧急行动类型分组"
              : "按部门归属聚合，同部门告警一起看"}
          </span>
        </div>
        <ChipRow label="分类">
          <FilterChip
            label="全部"
            count={statusCounts.active}
            active={filterCat === "all"}
            onClick={() => setFilterCat("all")}
          />
          {urgentActiveCount > 0 && (
            <FilterChip
              label="紧急"
              count={urgentActiveCount}
              active={filterCat === "urgent"}
              tone="danger"
              onClick={() => setFilterCat("urgent")}
            />
          )}
          {(["quota", "model", "spend", "user"] as InsightCategory[]).map((c) => (
            <FilterChip
              key={c}
              label={CATEGORY_LABEL[c]}
              count={catCounts[c]}
              active={filterCat === c}
              dotColor={CATEGORY_COLOR[c]}
              onClick={() => setFilterCat(c)}
              disabled={catCounts[c] === 0 && filterStatus === "active"}
            />
          ))}
        </ChipRow>
        <ChipRow label="状态">
          <FilterChip
            label="待处理"
            count={statusCounts.active}
            active={filterStatus === "active"}
            onClick={() => setFilterStatus("active")}
          />
          <FilterChip
            label="已处理"
            count={statusCounts.actioned}
            active={filterStatus === "actioned"}
            disabled={statusCounts.actioned === 0}
            onClick={() => setFilterStatus("actioned")}
          />
          <FilterChip
            label="已忽略"
            count={statusCounts.ignored}
            active={filterStatus === "ignored"}
            disabled={statusCounts.ignored === 0}
            onClick={() => setFilterStatus("ignored")}
          />
        </ChipRow>
      </div>

      {/* 列表 */}
      <div className="mt-4" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? (
          <EmptyState status={filterStatus} />
        ) : viewMode === "by-dept" && deptBuckets ? (
          /* 按部门聚合视图 */
          <>
            {deptBuckets.map((bucket) => (
              <DeptBucket
                key={bucket.dept_id ?? "__cross__"}
                bucket={bucket}
                expandedKey={expandedKey}
                highlightKey={highlightKey}
                onToggle={(k) =>
                  setExpandedKey((cur) => (cur === k ? null : k))
                }
              />
            ))}
          </>
        ) : (
          <>
            {/* 紧急区 · 按行动类型分组 */}
            {urgentBuckets && (
              <>
                {urgentBuckets.user.length > 0 && (
                  <>
                    <ActionGroupHeader
                      icon="user"
                      label="用户异常"
                      hint="建议线下沟通"
                      count={urgentBuckets.user.length}
                      tone="danger"
                    />
                    {urgentBuckets.user.map((it) => (
                      <InsightRow
                        key={it.key}
                        insight={it}
                        expanded={expandedKey === it.key}
                        highlighted={highlightKey === it.key}
                        onToggle={() =>
                          setExpandedKey((k) => (k === it.key ? null : it.key))
                        }
                      />
                    ))}
                  </>
                )}
                {urgentBuckets.model.length > 0 && (
                  <>
                    <ActionGroupHeader
                      icon="chart"
                      label="趋势预警"
                      hint="建议本周评估"
                      count={urgentBuckets.model.length}
                      tone="danger"
                    />
                    {urgentBuckets.model.map((it) => (
                      <InsightRow
                        key={it.key}
                        insight={it}
                        expanded={expandedKey === it.key}
                        highlighted={highlightKey === it.key}
                        onToggle={() =>
                          setExpandedKey((k) => (k === it.key ? null : it.key))
                        }
                      />
                    ))}
                  </>
                )}
                {urgentBuckets.quotaSpend.length > 0 && (
                  <>
                    <ActionGroupHeader
                      icon="shield"
                      label="配额预警"
                      hint="建议立即调整"
                      count={urgentBuckets.quotaSpend.length}
                      tone="danger"
                    />
                    {urgentBuckets.quotaSpend.map((it) => (
                      <InsightRow
                        key={it.key}
                        insight={it}
                        expanded={expandedKey === it.key}
                        highlighted={highlightKey === it.key}
                        onToggle={() =>
                          setExpandedKey((k) => (k === it.key ? null : it.key))
                        }
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {/* 普通待关注 */}
            {normalInsights.length > 0 && (
              <>
                {urgentBuckets && (
                  <ActionGroupHeader
                    icon="bell"
                    label="待关注"
                    hint="可在 1-2 天内评估"
                    count={normalInsights.length}
                    tone="warn"
                  />
                )}
                {normalInsights.map((it) => (
                  <InsightRow
                    key={it.key}
                    insight={it}
                    expanded={expandedKey === it.key}
                    highlighted={highlightKey === it.key}
                    onToggle={() =>
                      setExpandedKey((k) => (k === it.key ? null : it.key))
                    }
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KindTab({
  active,
  label,
  hint,
  count,
  tone,
  onClick
}: {
  active: boolean;
  label: string;
  hint: string;
  count: number;
  tone: "danger" | "neutral";
  onClick: () => void;
}) {
  const activeColor = tone === "danger" ? "var(--danger)" : "var(--text)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        padding: "10px 16px 12px",
        cursor: "pointer",
        borderBottom: active ? `2px solid ${activeColor}` : "2px solid transparent",
        marginBottom: -1,
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 120
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          color: active ? activeColor : "var(--text-2)"
        }}
      >
        {label}
        <span
          className="chip"
          style={{
            height: 17,
            padding: "0 6px",
            fontSize: 10,
            background:
              tone === "danger"
                ? "var(--danger-soft, #FDECEC)"
                : active
                  ? "var(--bg)"
                  : "var(--bg)",
            color: tone === "danger" ? "var(--danger)" : "var(--text-2)",
            fontWeight: 600
          }}
        >
          {count}
        </span>
      </span>
      <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>{hint}</span>
    </button>
  );
}

function DeptBucket({
  bucket,
  expandedKey,
  highlightKey,
  onToggle
}: {
  bucket: { dept_id: string | null; dept_name: string; insights: Insight[] };
  expandedKey: string | null;
  highlightKey: string | null;
  onToggle: (k: string) => void;
}) {
  const urgent = bucket.insights.filter((i) => i.severity === "urgent").length;
  const isCross = bucket.dept_id === null;
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px 8px",
        background: "var(--card)"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border)"
        }}
      >
        <Icon
          name={isCross ? "chart" : "building"}
          size={14}
          style={{ color: isCross ? "var(--accent)" : "var(--violet)" }}
        />
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--text)",
            letterSpacing: "-0.005em"
          }}
        >
          {bucket.dept_name}
        </span>
        <span
          className="chip"
          style={{
            height: 18,
            padding: "0 7px",
            fontSize: 11,
            background: "var(--bg)",
            color: "var(--text-2)",
            fontWeight: 600
          }}
        >
          {bucket.insights.length} 项
        </span>
        {urgent > 0 && (
          <span
            className="chip"
            style={{
              height: 17,
              padding: "0 6px",
              fontSize: 10,
              background: "var(--danger-soft, #FDECEC)",
              color: "var(--danger)",
              fontWeight: 600
            }}
          >
            {urgent} 紧急
          </span>
        )}
        {!isCross && bucket.dept_id && (
          <>
            <span style={{ flex: 1 }} />
            <Link
              href={`/admin?focus=dept&dept=${encodeURIComponent(bucket.dept_id)}`}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11.5 }}
            >
              查看部门看板
            </Link>
          </>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {bucket.insights.map((it) => (
          <InsightRow
            key={it.key}
            insight={it}
            expanded={expandedKey === it.key}
            highlighted={highlightKey === it.key}
            onToggle={() => onToggle(it.key)}
          />
        ))}
      </div>
    </div>
  );
}

function ActionGroupHeader({
  icon,
  label,
  hint,
  count,
  tone
}: {
  icon: "user" | "chart" | "shield" | "bell";
  label: string;
  hint: string;
  count: number;
  tone: "danger" | "warn";
}) {
  const color = tone === "danger" ? "var(--danger)" : "var(--warn)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 4px 4px",
        marginTop: 4
      }}
    >
      <Icon name={icon} size={13} style={{ color }} />
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
        {label}
      </span>
      <span
        className="chip"
        style={{
          height: 17,
          padding: "0 6px",
          fontSize: 10,
          background: tone === "danger" ? "var(--danger-soft, #FDECEC)" : "var(--warn-soft)",
          color,
          fontWeight: 600
        }}
      >
        {count}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>·</span>
      <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{hint}</span>
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span
        className="t-cap"
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          textTransform: "none",
          width: 32,
          flexShrink: 0
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  disabled,
  tone,
  dotColor
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
  dotColor?: string;
}) {
  const bg = active
    ? tone === "danger"
      ? "var(--danger-soft, #FDECEC)"
      : "var(--accent-soft)"
    : "var(--card)";
  const fg = active
    ? tone === "danger"
      ? "var(--danger)"
      : "var(--accent-ink)"
    : "var(--text-2)";
  const border = active
    ? tone === "danger"
      ? "var(--danger)"
      : "var(--accent)"
    : "var(--border)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background .15s, border-color .15s, color .15s, transform .15s"
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.borderColor = "var(--border-strong)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.borderColor = "var(--border)";
        }
      }}
    >
      {dotColor && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: dotColor,
            flexShrink: 0
          }}
        />
      )}
      <span>{label}</span>
      <span
        className="num"
        style={{
          fontWeight: 600,
          fontSize: 11,
          color: active ? fg : "var(--text-3)"
        }}
      >
        {count}
      </span>
    </button>
  );
}

function InsightRow({
  insight,
  expanded,
  highlighted,
  onToggle
}: {
  insight: Insight;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
}) {
  // signal 类：永远中性灰边（不强调紧急感）；alert 类按 severity 高亮
  const accent =
    insight.kind === "signal"
      ? "var(--border-strong)"
      : insight.severity === "urgent"
        ? "var(--danger)"
        : CATEGORY_COLOR[insight.category];

  return (
    <div
      id={`insight-${cssId(insight.key)}`}
      className="card"
      style={{
        padding: 0,
        borderLeft: `3px solid ${accent}`,
        boxShadow: highlighted
          ? "0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)"
          : undefined,
        transition: "box-shadow .25s"
      }}
    >
      {/* 紧凑行 · 整行可点 */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10
        }}
      >
        <Icon
          name={CATEGORY_ICON[insight.category]}
          size={13}
          style={{ color: accent, flexShrink: 0 }}
        />
        {insight.kind === "alert" && <SeverityDot severity={insight.severity} />}
        <span
          style={{
            fontSize: 11.5,
            color: "var(--text-3)",
            fontWeight: 500,
            width: 56,
            flexShrink: 0
          }}
        >
          {CATEGORY_LABEL[insight.category]}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 13.5,
            color: "var(--text)",
            fontWeight: 500,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {insight.title}
        </span>
        {insight.status !== "active" && <StatusBadge status={insight.status} />}
        <Icon
          name="chevDown"
          size={12}
          className="ico"
          style={{
            color: "var(--text-3)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .2s",
            flexShrink: 0
          }}
        />
      </button>

      {/* 展开详情 */}
      {expanded && (
        <div
          style={{
            padding: "0 14px 14px 14px",
            borderTop: "1px solid var(--border)",
            paddingTop: 12
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-2)",
              lineHeight: 1.6,
              marginBottom: 10
            }}
          >
            {insight.body}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              marginBottom: 10
            }}
          >
            {insight.metrics.map((m, i) => (
              <span key={i} style={{ fontSize: 11.5 }}>
                <span style={{ color: "var(--text-3)" }}>{m.label} </span>
                <span className="num" style={{ color: "var(--text)", fontWeight: 600 }}>
                  {m.value}
                </span>
              </span>
            ))}
          </div>
          {insight.suggestion && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-3)",
                fontStyle: "italic",
                marginBottom: 10,
                padding: "8px 10px",
                background: "var(--bg)",
                borderRadius: 6,
                borderLeft: "2px solid var(--accent-soft)"
              }}
            >
              建议：{insight.suggestion}
            </div>
          )}
          {insight.impact && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-2)",
                marginBottom: 10,
                padding: "8px 10px",
                background: "var(--accent-soft)",
                borderRadius: 6,
                borderLeft: "2px solid var(--accent)"
              }}
            >
              影响估算：{insight.impact}
            </div>
          )}

          {/* 非 active 状态：显示操作历史（who/when/note） */}
          {insight.status !== "active" && <ActionHistoryRow insightKey={insight.key} />}

          {/* 模型类告警：行内展开完整 ModelDetailExpansion，避免跳页 */}
          {insight.category === "model" && insight.model_name && (
            <div
              style={{
                marginBottom: 10,
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--border)"
              }}
            >
              <ModelDetailExpansion modelName={insight.model_name} />
            </div>
          )}

          {/* 配额类告警 active 状态：inline 调整 */}
          {(insight.category === "quota" || insight.category === "spend") &&
            insight.status === "active" &&
            insight.quota_context && (
              <div style={{ marginBottom: 10 }}>
                <QuotaInlineAdjust
                  insightKey={insight.key}
                  deptId={insight.quota_context.department_id}
                  currentLimit={insight.quota_context.credits_limit}
                  suggestedLimit={insight.quota_context.suggested_limit}
                />
              </div>
            )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {insight.evidence.map((e, i) => (
              <Link
                key={i}
                href={e.href}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11.5 }}
              >
                <Icon name="link" size={11} />
                {e.label}
              </Link>
            ))}
            {insight.status === "active" ? (
              <>
                <span style={{ flex: 1 }} />
                <ActionButton insightKey={insight.key} action="actioned" label="标记已处理" />
                <ActionButton insightKey={insight.key} action="ignored" label="忽略" />
              </>
            ) : (
              <>
                <span style={{ flex: 1 }} />
                <ActionButton insightKey={insight.key} action="reset" label="撤回处理" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityDot({ severity }: { severity: "urgent" | "normal" }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: severity === "urgent" ? "var(--danger)" : "var(--warn)",
        flexShrink: 0
      }}
    />
  );
}

function StatusBadge({ status }: { status: InsightStatus }) {
  if (status === "active") return null;
  const txt = status === "actioned" ? "已处理" : "已忽略";
  const fg = status === "actioned" ? "var(--success)" : "var(--text-3)";
  const bg = status === "actioned" ? "var(--success-soft)" : "var(--bg)";
  return (
    <span
      className="chip"
      style={{
        height: 17,
        padding: "0 7px",
        fontSize: 10,
        background: bg,
        color: fg,
        fontWeight: 600,
        flexShrink: 0
      }}
    >
      {txt}
    </span>
  );
}

function ActionHistoryRow({ insightKey }: { insightKey: string }) {
  const [rows, setRows] = useState<Array<{
    action_type: "ignored" | "actioned";
    actor_name: string | null;
    acted_at: string;
    note: string | null;
  }> | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/admin/insights/history?insight_key=${encodeURIComponent(insightKey)}`, {
      signal: ac.signal
    })
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch(() => {});
    return () => ac.abort();
  }, [insightKey]);

  if (!rows) return null;
  const latest = rows[0];
  if (!latest) return null;
  const when = new Date(latest.acted_at);
  const whenStr = `${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      style={{
        marginBottom: 10,
        padding: "8px 10px",
        background: "var(--bg)",
        borderRadius: 6,
        borderLeft: "2px solid var(--text-4)",
        fontSize: 11.5,
        color: "var(--text-3)"
      }}
    >
      <div>
        <span className="num" style={{ color: "var(--text-2)" }}>
          {latest.actor_name ?? "(未知)"}
        </span>{" "}
        于 <span className="num">{whenStr}</span> 标记
        <span
          style={{
            marginLeft: 4,
            color: latest.action_type === "actioned" ? "var(--success)" : "var(--text-3)",
            fontWeight: 500
          }}
        >
          {latest.action_type === "actioned" ? "已处理" : "已忽略"}
        </span>
        {latest.note && (
          <span style={{ color: "var(--text-2)", marginLeft: 6 }}>· {latest.note}</span>
        )}
      </div>
      {rows.length > 1 && (
        <div style={{ marginTop: 4, color: "var(--text-4)", fontSize: 11 }}>
          共 {rows.length} 次操作历史
        </div>
      )}
    </div>
  );
}

function ActionButton({
  insightKey,
  action,
  label
}: {
  insightKey: string;
  action: "actioned" | "ignored" | "reset";
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/insights/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insight_key: insightKey, action_type: action })
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={onClick}
      disabled={busy}
      style={{ fontSize: 11.5 }}
    >
      {busy ? "..." : label}
    </button>
  );
}

function EmptyState({ status }: { status: FilterStatus }) {
  const txt =
    status === "active"
      ? "暂无符合条件的洞察"
      : status === "actioned"
        ? "尚未标记过任何已处理"
        : "尚未忽略过任何洞察";
  return (
    <div
      className="card card-pad text-center"
      style={{
        color: "var(--text-3)",
        padding: "40px 16px",
        fontSize: 13
      }}
    >
      <Icon
        name="check"
        size={28}
        style={{ color: "var(--success)", marginBottom: 8 }}
      />
      <div>{txt}</div>
    </div>
  );
}

/** key 形如 "user_spike:abc:2026-W21" 含 : 不是合法 CSS id，转一下 */
function cssId(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}
