"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { fmtInt } from "@/components/ui/primitives";

// 部门看板 列表态（态 A） — admin Overview 第 3 tab 默认视图
// 视觉风格与 tab 1/2 对齐：section-head 带 ● 圆点 + table 主体
// 列设计精简到 5 列：部门 / 用量+配额（合并） / TOP 目的 / TOP 模型 / 操作

export interface DeptDetail {
  dept_id: string;
  dept_name: string;
  image_credits: number;
  video_credits: number;
  total_credits: number;
  credits_limit: number;
  usage_ratio: number;
  member_count: number;
  active_member_count: number;
  purposes: Array<{ purpose_tag_name: string; count: number }>;
  models: Array<{ model_name: string; count: number; credits: number }>;
  top_members: Array<{ user_id: string; user_name: string; credits_used: number; call_count: number }>;
}

interface Props {
  depts: DeptDetail[];
  /** 从总览跳转过来的部门 — 高亮 + 滚动到位 */
  highlightDeptId?: string | null;
  onOpenDept: (deptId: string) => void;
}

export function DeptOverviewPanel({ depts, highlightDeptId, onOpenDept }: Props) {
  const rowRefs = useRef<Map<string, HTMLTableRowElement | null>>(new Map());

  useEffect(() => {
    if (!highlightDeptId) return;
    const el = rowRefs.current.get(highlightDeptId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightDeptId]);

  const summary = useMemo(() => {
    const totalCredits = depts.reduce((s, d) => s + d.total_credits, 0);
    const totalLimit = depts.reduce((s, d) => s + d.credits_limit, 0);
    const overQuota = depts.filter((d) => d.usage_ratio >= 1).length;
    const nearQuota = depts.filter((d) => d.usage_ratio >= 0.85 && d.usage_ratio < 1).length;
    const sharePct = totalLimit > 0 ? (totalCredits / totalLimit) * 100 : null;
    return { totalCredits, totalLimit, overQuota, nearQuota, sharePct };
  }, [depts]);

  // 默认按"超额优先 + 总积分降序" — 把需要关注的部门自然顶到表头，省去切换
  const sorted = useMemo(() => {
    const arr = [...depts];
    arr.sort((a, b) => {
      if (a.usage_ratio >= 1 && b.usage_ratio < 1) return -1;
      if (a.usage_ratio < 1 && b.usage_ratio >= 1) return 1;
      return b.total_credits - a.total_credits;
    });
    return arr;
  }, [depts]);

  if (depts.length === 0) {
    return (
      <div
        className="card card-pad text-center"
        style={{ padding: "48px 16px", color: "var(--text-3)" }}
      >
        暂无部门数据
      </div>
    );
  }

  return (
    <>
      {/* inline summary 条 */}
      <SummaryStrip summary={summary} totalDepts={depts.length} />

      {/* 主表 5 列 */}
      <div className="card" style={{ padding: 0 }}>
        <table className="table" style={{ fontSize: 13, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "16%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>部门</th>
              <th>本月用量 · 配额</th>
              <th>TOP 目的</th>
              <th>TOP 模型</th>
              <th style={{ textAlign: "right" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const isHighlighted = highlightDeptId === d.dept_id;
              const tier =
                d.usage_ratio >= 1 ? "danger" : d.usage_ratio >= 0.85 ? "warn" : "ok";
              const pct = Math.round(d.usage_ratio * 100);
              return (
                <tr
                  key={d.dept_id}
                  ref={(el) => {
                    rowRefs.current.set(d.dept_id, el);
                  }}
                  style={{
                    cursor: "pointer",
                    background: isHighlighted ? "var(--accent-soft)" : undefined,
                    transition: "background .15s"
                  }}
                  onClick={() => onOpenDept(d.dept_id)}
                  title={`查看 ${d.dept_name} 部门看板`}
                >
                  {/* 部门 */}
                  <td>
                    <div className="fw-5" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {d.dept_name}
                    </div>
                  </td>

                  {/* 用量 · 配额（合并列：上行数字，下行进度条+%） */}
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 4,
                        marginBottom: 4,
                        whiteSpace: "nowrap"
                      }}
                    >
                      <span className="num fw-6" style={{ fontSize: 13 }}>
                        {fmtInt(d.total_credits)}
                      </span>
                      <span className="num" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                        / {d.credits_limit > 0 ? fmtInt(d.credits_limit) : "未设"}
                      </span>
                    </div>
                    {d.credits_limit > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="bar" style={{ flex: 1 }}>
                          <div
                            className={`bar-fill ${tier === "danger" ? "danger" : tier === "warn" ? "warn" : "accent"}`}
                            style={{ width: Math.min(100, pct) + "%" }}
                          />
                        </div>
                        <span
                          className="num"
                          style={{
                            fontSize: 11.5,
                            color:
                              tier === "danger"
                                ? "var(--danger)"
                                : tier === "warn"
                                  ? "var(--warn)"
                                  : "var(--text-2)",
                            fontWeight: 600,
                            minWidth: 40,
                            textAlign: "right"
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{ fontSize: 11, color: "var(--text-3)" }}
                      >
                        未设配额
                      </div>
                    )}
                  </td>

                  {/* TOP 目的 — 限 2 个 + N 折叠 */}
                  <td>
                    <ChipList
                      items={d.purposes.map((p) => p.purpose_tag_name)}
                      max={2}
                      accent="default"
                    />
                  </td>

                  {/* TOP 模型 — 限 1 + N，模型名 strip 长括号后缀 */}
                  <td>
                    <ChipList
                      items={d.models.map((m) => stripBrand(m.model_name))}
                      max={1}
                      accent="violet"
                    />
                  </td>

                  {/* 操作 — 入口提示 */}
                  <td className="text-right">
                    <span
                      className="num"
                      style={{
                        fontSize: 14,
                        color: "var(--text-3)",
                        display: "inline-block"
                      }}
                    >
                      ›
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="t-cap"
        style={{
          textTransform: "none",
          marginTop: 10,
          color: "var(--text-3)",
          fontSize: 11
        }}
      >
        提示：配额超额 / 临近上限的部门优先评估；用途分布可指导是否需为该部门定制目的标签；模型偏好可用于采购与授权决策。
      </div>
    </>
  );
}

// ─── inline summary 条（替代原 4 大卡） ─────────────────────────

function SummaryStrip({
  summary,
  totalDepts
}: {
  summary: {
    totalCredits: number;
    totalLimit: number;
    overQuota: number;
    nearQuota: number;
    sharePct: number | null;
  };
  totalDepts: number;
}) {
  const hasAlert = summary.overQuota > 0 || summary.nearQuota > 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px",
        marginBottom: 12,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: hasAlert
          ? "linear-gradient(135deg, #FFFBEF 0%, #FFFFFF 70%)"
          : "var(--bg-subtle)",
        borderColor: summary.overQuota > 0
          ? "rgba(220,38,38,.22)"
          : summary.nearQuota > 0
            ? "rgba(217,119,6,.22)"
            : "var(--border)",
        fontSize: 12.5,
        color: "var(--text-2)",
        flexWrap: "wrap"
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon
          name={hasAlert ? "alert" : "info"}
          size={13}
          style={{ color: summary.overQuota > 0 ? "var(--danger)" : hasAlert ? "var(--warn)" : "var(--text-3)" }}
        />
        共 <span className="num fw-6" style={{ color: "var(--text)" }}>{totalDepts}</span> 部门
      </span>
      <Sep />
      <span>
        本月{" "}
        <span className="num fw-6" style={{ color: "var(--text)" }}>
          {fmtInt(summary.totalCredits)}
        </span>{" "}
        积分
        {summary.sharePct != null && (
          <span style={{ color: "var(--text-3)", marginLeft: 4 }}>
            （占配额 <span className="num">{summary.sharePct.toFixed(1)}%</span>）
          </span>
        )}
      </span>
      <Sep />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: summary.overQuota > 0 ? "var(--danger)" : "var(--border-strong)"
          }}
        />
        <span className="num fw-6" style={{ color: summary.overQuota > 0 ? "var(--danger)" : "var(--text-2)" }}>
          {summary.overQuota}
        </span>{" "}
        超额
      </span>
      <Sep />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: summary.nearQuota > 0 ? "var(--warn)" : "var(--border-strong)"
          }}
        />
        <span className="num fw-6" style={{ color: summary.nearQuota > 0 ? "var(--warn)" : "var(--text-2)" }}>
          {summary.nearQuota}
        </span>{" "}
        临近上限
      </span>
      <span style={{ flex: 1 }} />
      {(summary.overQuota > 0 || summary.nearQuota > 0) && (
        <Link
          href="/manage?tab=quota"
          className="btn btn-soft btn-sm"
          onClick={(e) => e.stopPropagation()}
          style={{ whiteSpace: "nowrap" }}
        >
          <Icon name="shield" size={11} /> 调整配额 <Icon name="arrow" size={10} />
        </Link>
      )}
    </div>
  );
}

function Sep() {
  return <span style={{ color: "var(--text-4)", fontSize: 12 }}>·</span>;
}

// ─── ChipList — 限制数量 + 折叠 +N ─────────────────────────────

function ChipList({
  items,
  max,
  accent
}: {
  items: string[];
  max: number;
  accent: "default" | "violet";
}) {
  if (items.length === 0) {
    return <span style={{ color: "var(--text-4)", fontSize: 12 }}>—</span>;
  }
  const visible = items.slice(0, max);
  const remain = items.length - visible.length;
  const baseCls = accent === "violet" ? "chip chip-soft-violet" : "chip";
  return (
    <div
      className="flex items-center"
      style={{ gap: 4, flexWrap: "nowrap", overflow: "hidden" }}
    >
      {visible.map((it) => (
        <span
          key={it}
          className={baseCls}
          title={it}
          style={{
            height: 22,
            fontSize: 11.5,
            maxWidth: "70%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "inline-block",
            lineHeight: "22px",
            padding: "0 8px"
          }}
        >
          {it}
        </span>
      ))}
      {remain > 0 && (
        <span
          className="chip"
          title={items.slice(max).join("、")}
          style={{
            height: 22,
            fontSize: 11.5,
            background: "var(--bg-subtle)",
            color: "var(--text-3)",
            flexShrink: 0
          }}
        >
          +{remain}
        </span>
      )}
    </div>
  );
}

// ─── 工具：剥掉模型名长后缀，避免撑列宽 ──────────────────────────
// 形如「Dreamina Seedance 2.0 Fast (easyrouter)」→「Dreamina Seedance 2.0 Fast」
function stripBrand(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
