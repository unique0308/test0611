"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { fmtInt } from "@/components/ui/primitives";

// 部门成员本周 vs 上周异动卡 — manager dashboard + admin DeptDetailPanel 共用
// 默认显示有异动的（ratio ≥ 3 或新激活），admin 可点开"显示全部"看完整列表

type Row = {
  user_id: string;
  user_name: string;
  email: string;
  this_week_credits: number;
  prev_week_credits: number;
  this_week_count: number;
  prev_week_count: number;
  ratio: number | null;
};

const SPIKE_THRESHOLD = 3;
const SPIKE_MIN_CREDITS = 100;

export function DeptMemberSpike({
  deptId,
  deptName,
  onUserClick
}: {
  deptId: string;
  deptName: string;
  /** 可选：行点击回调；默认跳 /admin?tab=detail&user=X（仅 admin 路径会用到） */
  onUserClick?: (userId: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/dept-member-spike?dept_id=${encodeURIComponent(deptId)}`, {
      signal: ac.signal
    })
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch(() => {
        if (!ac.signal.aborted) setError(true);
      });
    return () => ac.abort();
  }, [deptId]);

  const { spikes, normal, totalActive } = useMemo(() => {
    if (!rows) return { spikes: [], normal: [], totalActive: 0 };
    const active = rows.filter((r) => r.this_week_credits > 0);
    const spikes = active.filter(
      (r) =>
        r.this_week_credits >= SPIKE_MIN_CREDITS &&
        (r.ratio === null || (r.ratio ?? 0) >= SPIKE_THRESHOLD)
    );
    const normal = active.filter((r) => !spikes.includes(r));
    return { spikes, normal, totalActive: active.length };
  }, [rows]);

  if (error) {
    return null;
  }

  return (
    <div
      className="bg-card rounded-lg border border-border"
      style={{ marginBottom: 16, overflow: "hidden" }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          gap: 10
        }}
      >
        <Icon name="trend" size={14} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {deptName} · 成员用量异动
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          本周 vs 上周 · {SPIKE_THRESHOLD}× 以上自动标记
        </span>
        <span style={{ flex: 1 }} />
        {rows && normal.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11.5 }}
          >
            {showAll ? "仅看异动" : `显示全部（${totalActive}）`}
          </button>
        )}
      </div>

      <div style={{ padding: "8px 14px 12px" }}>
        {!rows ? (
          <div style={{ padding: "16px 0", fontSize: 12, color: "var(--text-3)" }}>
            加载中…
          </div>
        ) : spikes.length === 0 && !showAll ? (
          <div
            style={{
              padding: "16px 4px",
              fontSize: 12.5,
              color: "var(--success)",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
          >
            <Icon name="check" size={13} />
            本周无成员用量显著异动
            {totalActive > 0 && (
              <span style={{ color: "var(--text-3)", marginLeft: 6 }}>
                · {totalActive} 位成员有生成活动
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {spikes.map((r) => (
              <MemberRow
                key={r.user_id}
                row={r}
                spike
                onClick={onUserClick ? () => onUserClick(r.user_id) : undefined}
              />
            ))}
            {showAll &&
              normal.map((r) => (
                <MemberRow
                  key={r.user_id}
                  row={r}
                  spike={false}
                  onClick={onUserClick ? () => onUserClick(r.user_id) : undefined}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  row,
  spike,
  onClick
}: {
  row: Row;
  spike: boolean;
  onClick?: () => void;
}) {
  const ratioLabel =
    row.ratio === null
      ? "新激活"
      : row.ratio === Infinity
        ? "新激活"
        : `${row.ratio.toFixed(1)}×`;
  const tone = spike
    ? row.ratio === null
      ? "var(--danger)"
      : (row.ratio ?? 0) >= 5
        ? "var(--danger)"
        : "var(--warn)"
    : "var(--text-3)";

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        borderRadius: 6,
        cursor: onClick ? "pointer" : "default",
        background: spike ? "var(--bg)" : "transparent",
        transition: "background .15s"
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = "var(--bg)";
      }}
      onMouseLeave={(e) => {
        if (onClick && !spike) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          background: "var(--accent-soft)",
          color: "var(--accent-ink)",
          fontSize: 11,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
      >
        {row.user_name.slice(0, 1)}
      </span>
      <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, flex: 1, minWidth: 0 }}>
        {row.user_name}
      </span>
      <span
        style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "var(--font-mono)", width: 120, textAlign: "right" }}
      >
        本周 <span style={{ color: "var(--text)", fontWeight: 600 }}>{fmtInt(row.this_week_credits)}</span>
      </span>
      <span
        style={{
          fontSize: 11.5,
          color: "var(--text-4)",
          fontFamily: "var(--font-mono)",
          width: 100,
          textAlign: "right"
        }}
      >
        上周 {fmtInt(row.prev_week_credits)}
      </span>
      <span
        style={{
          fontSize: 11.5,
          color: tone,
          fontWeight: 600,
          width: 64,
          textAlign: "right"
        }}
      >
        {ratioLabel}
      </span>
    </div>
  );
}
