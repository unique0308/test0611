"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtInt } from "@/components/ui/primitives";

// 模型异动行内展开 · 按需 fetch
// 改造（2026-05-27）：
//   - 14 天 sparkline → 近 6 月柱图（与"上月 vs 本月双柱"口径一致）
//   - 点击月柱切换 selectedMonth → byDept / byPurpose / peers refetch 联动
//   - selectedMonth 默认 = 本月

type MonthlyPoint = { month: string; credits: number; count: number };

type ModelDetailData = {
  monthly: MonthlyPoint[];
  byDept: Array<{
    department_id: string | null;
    department_name: string;
    credits: number;
    count: number;
  }>;
  byPurpose: Array<{ purpose_tag_name: string; credits: number; count: number }>;
  self_type: "image" | "video" | null;
  peers: Array<{
    model_name: string;
    credits: number;
    count: number;
    avg_credits_per_call: number;
    is_self: boolean;
  }>;
};

function thisMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]} 月` : month;
}

export function ModelDetailExpansion({ modelName }: { modelName: string }) {
  const [data, setData] = useState<ModelDetailData | null>(null);
  const [error, setError] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(thisMonthKey());

  useEffect(() => {
    const ac = new AbortController();
    fetch(
      `/api/admin/model-detail?model=${encodeURIComponent(modelName)}&month=${encodeURIComponent(selectedMonth)}`,
      { signal: ac.signal }
    )
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => {
        if (!ac.signal.aborted && (e as Error).message !== "fetch failed") {
          setError(true);
        } else if (!ac.signal.aborted) {
          setError(true);
        }
      });
    return () => ac.abort();
  }, [modelName, selectedMonth]);

  if (error) {
    return (
      <div
        style={{
          padding: "12px 14px",
          fontSize: 12,
          color: "var(--text-3)",
          background: "var(--bg)"
        }}
      >
        加载失败，请稍后重试
      </div>
    );
  }
  if (!data) {
    return (
      <div
        style={{
          padding: "12px 14px",
          fontSize: 12,
          color: "var(--text-3)",
          background: "var(--bg)"
        }}
      >
        加载中…
      </div>
    );
  }

  // 当前选中月的数据
  const selectedPoint = data.monthly.find((m) => m.month === selectedMonth);
  // 上一个月（用于环比展示）
  const idx = data.monthly.findIndex((m) => m.month === selectedMonth);
  const prevPoint = idx > 0 ? data.monthly[idx - 1] : null;

  const totalCredits = selectedPoint?.credits ?? 0;
  const totalCount = selectedPoint?.count ?? 0;
  const avgPerCall = totalCount > 0 ? Math.round(totalCredits / totalCount) : 0;
  const momPct =
    prevPoint && prevPoint.credits > 0
      ? Math.round(((totalCredits - prevPoint.credits) / prevPoint.credits) * 100)
      : null;

  const self = data.peers.find((p) => p.is_self);
  const others = data.peers.filter((p) => !p.is_self).slice(0, 3);
  const cheaper = others.filter(
    (p) =>
      self && p.avg_credits_per_call > 0 && p.avg_credits_per_call < self.avg_credits_per_call
  );

  const monthlyLabel = monthLabel(selectedMonth);

  return (
    <div
      style={{
        padding: "14px 16px 16px",
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 14
      }}
    >
      {/* 6 月柱图 + 当月指标 */}
      <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MonthlyBars
            data={data.monthly}
            selected={selectedMonth}
            onSelect={(m) => setSelectedMonth(m)}
            label="近 6 月积分趋势"
          />
        </div>
        <div
          style={{
            width: 220,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingLeft: 14,
            borderLeft: "1px solid var(--border)"
          }}
        >
          <Metric label={`${monthlyLabel}用量`} value={`${fmtInt(totalCredits)} 积分`} />
          <Metric label={`${monthlyLabel}调用`} value={`${fmtInt(totalCount)} 次`} />
          <Metric label="单次平均" value={avgPerCall > 0 ? `${avgPerCall} 积分` : "—"} />
          {momPct !== null && (
            <Metric
              label="环比上月"
              value={`${momPct > 0 ? "+" : ""}${momPct}%`}
              tone={momPct > 50 ? "warn" : momPct < -30 ? "warn" : undefined}
            />
          )}
        </div>
      </div>

      {/* 按部门 + 按用途（联动 selectedMonth）*/}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <DistList
          label={`按部门（${monthlyLabel}）`}
          rows={data.byDept.slice(0, 4).map((d) => ({
            label: d.department_name,
            credits: d.credits,
            count: d.count
          }))}
          color="var(--accent)"
        />
        <DistList
          label={`按用途（${monthlyLabel}）`}
          rows={data.byPurpose.slice(0, 4).map((p) => ({
            label: p.purpose_tag_name,
            credits: p.credits,
            count: p.count
          }))}
          color="var(--violet)"
        />
      </div>

      {/* 同类对比（联动 selectedMonth）*/}
      {data.peers.length > 1 && (
        <div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              marginBottom: 8,
              fontWeight: 500
            }}
          >
            同类型 {data.self_type === "image" ? "图片" : "视频"} 模型对比（{monthlyLabel}）
            {cheaper.length > 0 && self && (
              <span style={{ color: "var(--warn)", marginLeft: 8 }}>
                · 同类有更便宜：{cheaper[0].model_name.length > 16 ? cheaper[0].model_name.slice(0, 16) + "…" : cheaper[0].model_name}（{cheaper[0].avg_credits_per_call}/次 vs 当前 {self.avg_credits_per_call}/次）
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.peers.slice(0, 5).map((p) => {
              const maxCredits = Math.max(...data.peers.map((x) => x.credits));
              const pct = maxCredits > 0 ? (p.credits / maxCredits) * 100 : 0;
              return (
                <div
                  key={p.model_name}
                  style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}
                >
                  <span
                    style={{
                      width: 150,
                      color: p.is_self ? "var(--accent-ink)" : "var(--text-2)",
                      fontWeight: p.is_self ? 600 : 400,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      flexShrink: 0
                    }}
                  >
                    {p.is_self && "● "}
                    {p.model_name}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: "var(--border)",
                      borderRadius: 999,
                      overflow: "hidden",
                      minWidth: 60
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: p.is_self ? "var(--accent)" : "var(--text-4)",
                        transition: "width .3s"
                      }}
                    />
                  </div>
                  <span
                    className="num"
                    style={{
                      width: 90,
                      textAlign: "right",
                      color: "var(--text-2)",
                      fontSize: 11
                    }}
                  >
                    {fmtInt(p.credits)} 积分
                  </span>
                  <span
                    className="num"
                    style={{
                      width: 80,
                      textAlign: "right",
                      color: "var(--text-3)",
                      fontSize: 11
                    }}
                  >
                    {p.avg_credits_per_call > 0 ? `${p.avg_credits_per_call}/次` : "-"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-3)" }}>{label}</div>
      <div
        className="num"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: tone === "warn" ? "var(--warn)" : "var(--text)"
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DistList({
  label,
  rows,
  color
}: {
  label: string;
  rows: Array<{ label: string; credits: number; count: number }>;
  color: string;
}) {
  const total = rows.reduce((s, r) => s + r.credits, 0);
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          marginBottom: 6,
          fontWeight: 500
        }}
      >
        {label}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-4)" }}>本月暂无数据</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {rows.map((r, i) => {
            const pct = total > 0 ? (r.credits / total) * 100 : 0;
            return (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
              >
                <span
                  style={{
                    width: 80,
                    color: "var(--text-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {r.label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 4,
                    background: "var(--border)",
                    borderRadius: 999,
                    overflow: "hidden",
                    minWidth: 40
                  }}
                >
                  <div
                    style={{ height: "100%", width: `${pct}%`, background: color }}
                  />
                </div>
                <span
                  className="num"
                  style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600 }}
                >
                  {Math.round(pct)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MonthlyBars({
  data,
  selected,
  onSelect,
  label
}: {
  data: MonthlyPoint[];
  selected: string;
  onSelect: (month: string) => void;
  label?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.credits));

  return (
    <div style={{ width: "100%" }}>
      {label && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            fontWeight: 500,
            marginBottom: 6
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 6,
          height: 110,
          background: "var(--card)",
          borderRadius: 8,
          padding: "12px 12px 8px",
          border: "1px solid var(--border)"
        }}
      >
        {data.map((d) => {
          const pct = max > 0 ? (d.credits / max) * 100 : 0;
          const isSelected = d.month === selected;
          const fill = isSelected
            ? "var(--accent)"
            : "color-mix(in srgb, var(--accent) 30%, var(--border))";
          return (
            <button
              key={d.month}
              type="button"
              onClick={() => onSelect(d.month)}
              aria-pressed={isSelected}
              aria-label={`切换到 ${monthLabel(d.month)}`}
              style={{
                flex: 1,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 4,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                minWidth: 0,
                outline: "none"
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  const bar = e.currentTarget.querySelector(
                    "[data-bar]"
                  ) as HTMLElement | null;
                  if (bar) bar.style.background = "var(--accent-ink)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  const bar = e.currentTarget.querySelector(
                    "[data-bar]"
                  ) as HTMLElement | null;
                  if (bar) bar.style.background = fill;
                }
              }}
            >
              <div
                style={{
                  width: "100%",
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-end",
                  position: "relative",
                  minHeight: 0
                }}
              >
                <div
                  data-bar
                  style={{
                    width: "100%",
                    height: `${Math.max(2, pct)}%`,
                    background: fill,
                    borderRadius: "3px 3px 0 0",
                    transition: "background .15s, height .25s",
                    transformOrigin: "bottom",
                    transform: isSelected ? "scaleY(1.04)" : "scaleY(1)"
                  }}
                />
                {isSelected && (
                  <span
                    style={{
                      position: "absolute",
                      top: -10,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "4px solid transparent",
                      borderRight: "4px solid transparent",
                      borderTop: "5px solid var(--accent)"
                    }}
                  />
                )}
              </div>
              <span
                className="num"
                style={{
                  fontSize: 10.5,
                  color: isSelected ? "var(--accent-ink)" : "var(--text-3)",
                  fontWeight: isSelected ? 600 : 500,
                  marginTop: 2
                }}
              >
                {monthLabel(d.month)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
