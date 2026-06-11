"use client";

import { useCallback, useState } from "react";
import { useChartWidth } from "./useChartWidth";

export interface TrendSeries<K extends string = string> {
  key: K;
  color: string;
  label?: string;
}

export interface ReferenceLine {
  /** 数值（Y 轴位置） */
  value: number;
  /** 右上角小标签（如"配额上限 5,000"） */
  label?: string;
  /** 默认 var(--danger) */
  color?: string;
}

interface Props<K extends string = string> {
  /** 每个数据点应包含 `d` 作为 X 轴标签 + series 对应的数值键 */
  data: Array<{ d: string } & { [key: string]: number | string | undefined | null }>;
  series: TrendSeries<K>[];
  height?: number;
  hoverIndex?: number | null;
  onHoverIndex?: (i: number | null) => void;
  /** 横向参考线（如"配额上限"），右上角带标签 */
  referenceLines?: ReferenceLine[];
  /** 预测段：追加到 data 之后；series 的 key 复用，path 用虚线渲染 */
  forecastData?: Array<{ d: string } & { [key: string]: number | string | undefined | null }>;
}

export function TrendChart<K extends string = string>({
  data,
  series,
  height = 220,
  hoverIndex: externalHover,
  onHoverIndex,
  referenceLines,
  forecastData
}: Props<K>) {
  const [ref, w] = useChartWidth(720);
  // 受控/非受控混合：若调用方传了 hoverIndex（受控），用它；否则用内部 state
  // 这样像 DeptDetailPanel 那种没传 hover 的也能默认有 hover 反馈
  const [internalHover, setInternalHover] = useState<number | null>(null);
  const hoverIndex = externalHover !== undefined ? externalHover : internalHover;

  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 22;
  const chartW = w - padL - padR;
  const chartH = height - padT - padB;

  // 合并 data + forecastData 用于坐标空间（X 轴接续渲染）
  const allPoints = forecastData && forecastData.length > 0 ? [...data, ...forecastData] : data;
  const totalPts = allPoints.length;

  const dataValues = data.flatMap((d) =>
    series.map((s) => (d[s.key] as number | undefined) ?? 0)
  );
  const forecastValues = (forecastData ?? []).flatMap((d) =>
    series.map((s) => (d[s.key] as number | undefined) ?? 0)
  );
  const refValues = referenceLines?.map((r) => r.value) ?? [];
  const combined = [...dataValues, ...forecastValues, ...refValues];
  const rawMax = combined.length ? Math.max(...combined) : 1;
  // 留 15% 上方空间；如果有参考线，再多留 10% 让参考线不贴顶
  const max = rawMax * (refValues.length > 0 ? 1.18 : 1.15);
  const min = 0;
  const stepX = chartW / Math.max(1, totalPts - 1);

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i);

  const xy = (i: number, v: number): [number, number] => [
    padL + i * stepX,
    padT + chartH - ((v - min) / (max - min || 1)) * chartH
  ];

  const setHover = useCallback(
    (i: number | null) => {
      if (onHoverIndex) onHoverIndex(i);
      else setInternalHover(i);
    },
    [onHoverIndex]
  );

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // hover 范围仅限实测段 data（不含 forecast），避免悬停假数据
      const i = Math.max(0, Math.min(data.length - 1, Math.round((x - padL) / stepX)));
      setHover(i);
    },
    [stepX, data.length, setHover]
  );

  const handleLeave = useCallback(() => setHover(null), [setHover]);

  // 内置 tooltip — 仅在「非受控」模式下显示（受控时由父组件决定显示与否）
  const showInternalTooltip =
    externalHover === undefined && hoverIndex != null && data[hoverIndex];
  const hoverPoint = hoverIndex != null ? data[hoverIndex] : null;

  return (
    <div
      ref={ref}
      style={{ width: "100%", height, position: "relative" }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <svg width={w} height={height} style={{ display: "block" }}>
        {yTickValues.map((v, i) => {
          const y = padT + chartH - (v / (max || 1)) * chartH;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray={i === 0 ? "0" : "2 3"}
              />
              <text
                x={padL - 8}
                y={y + 3}
                fontSize="10"
                textAnchor="end"
                fill="var(--text-3)"
                fontFamily="var(--font-mono)"
              >
                {v >= 1000 ? (v / 1000).toFixed(0) + "k" : v.toFixed(0)}
              </text>
            </g>
          );
        })}

        {allPoints.map((d, i) => {
          // 避免首尾标签溢出 SVG 边界：首点左对齐、末点右对齐、中间居中
          const isLast = i === totalPts - 1;
          const isFirst = i === 0;
          if (!isFirst && !isLast && i % 2 !== 0) return null;
          const anchor = isFirst ? "start" : isLast ? "end" : "middle";
          // forecast 段标签弱化（淡色）
          const isForecast = i >= data.length;
          return (
            <text
              key={i}
              x={padL + i * stepX}
              y={height - 4}
              fontSize="10"
              textAnchor={anchor}
              fill={isForecast ? "var(--text-4)" : "var(--text-3)"}
              fontFamily="var(--font-mono)"
            >
              {d.d}
            </text>
          );
        })}

        {hoverIndex != null && (
          <line
            x1={padL + hoverIndex * stepX}
            x2={padL + hoverIndex * stepX}
            y1={padT}
            y2={padT + chartH}
            stroke="var(--text-3)"
            strokeDasharray="2 2"
          />
        )}

        {/* 参考线（如配额上限）— 横向虚线 + 右上角标签 */}
        {referenceLines?.map((r, idx) => {
          const y = padT + chartH - ((r.value - min) / (max - min || 1)) * chartH;
          const color = r.color ?? "var(--danger)";
          return (
            <g key={`ref-${idx}`} opacity={0.85}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke={color}
                strokeDasharray="4 4"
                strokeWidth={1.2}
              />
              {r.label && (
                <text
                  x={w - padR - 4}
                  y={y - 4}
                  fontSize="10"
                  textAnchor="end"
                  fill={color}
                  fontFamily="var(--font-mono)"
                  fontWeight={600}
                >
                  {r.label}
                </text>
              )}
            </g>
          );
        })}

        {series.map((s) => {
          // 实测段
          const realPts = data.map((d, i) => xy(i, (d[s.key] as number | undefined) ?? 0));
          const realPath = smoothPath(realPts);

          // 预测段（如果有），用虚线渲染；从 data 最后一个点接续
          let forecastPath: string | null = null;
          let forecastPts: Array<[number, number]> = [];
          if (forecastData && forecastData.length > 0 && realPts.length > 0) {
            const lastReal = realPts[realPts.length - 1];
            forecastPts = forecastData.map((d, i) =>
              xy(data.length + i, (d[s.key] as number | undefined) ?? 0)
            );
            forecastPath = smoothPath([lastReal, ...forecastPts]);
          }

          return (
            <g key={s.key}>
              <path
                d={realPath}
                fill="none"
                stroke={s.color}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {forecastPath && (
                <path
                  d={forecastPath}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.6}
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.7}
                />
              )}
              {realPts.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={2.5}
                  fill="#fff"
                  stroke={s.color}
                  strokeWidth={1.6}
                  opacity={hoverIndex != null && hoverIndex !== i ? 0.55 : 1}
                />
              ))}
              {forecastPts.map((p, i) => (
                <circle
                  key={`f-${i}`}
                  cx={p[0]}
                  cy={p[1]}
                  r={2}
                  fill="var(--card)"
                  stroke={s.color}
                  strokeWidth={1.2}
                  strokeDasharray="2 2"
                  opacity={0.55}
                />
              ))}
              {hoverIndex != null && realPts[hoverIndex] && (
                <circle
                  cx={realPts[hoverIndex][0]}
                  cy={realPts[hoverIndex][1]}
                  r={5}
                  fill="#fff"
                  stroke={s.color}
                  strokeWidth={2.2}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* 内置 tooltip — 右上角内嵌式（不随光标，避免遮挡曲线主体） */}
      {showInternalTooltip && hoverPoint && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: padR,
            top: -4,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            fontSize: 11.5,
            fontFamily: "var(--font-mono)",
            color: "var(--text-2)",
            background: "var(--card)",
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            boxShadow: "var(--sh-sm)",
            pointerEvents: "none",
            zIndex: 5,
            whiteSpace: "nowrap",
            animation: "tt-pop .14s ease both"
          }}
        >
          <span style={{ color: "var(--text-3)" }}>{hoverPoint.d}</span>
          {series.map((s) => {
            const v = (hoverPoint[s.key] as number | undefined) ?? 0;
            return (
              <span
                key={s.key}
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <span style={{ color: s.color, fontWeight: 600 }}>
                  {v.toLocaleString("en-US")}
                </span>
                <span style={{ color: "var(--text-3)", fontSize: 11 }}>
                  {s.label ?? s.key}
                </span>
              </span>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes tt-pop {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Monotone cubic interpolation（Fritsch-Carlson 算法 / d3 curveMonotoneX 同款）
// 关键性质：不会冲过相邻数据点的 y 范围 — 平段（连续 0 后突起）不会下探到负数
// 算法：相邻段斜率符号不同或为 0 时，该点切线取 0；否则取加权调和平均
function smoothPath(points: Array<[number, number]>): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0][0]} ${points[0][1]}`;
  if (n === 2) {
    return `M${points[0][0]} ${points[0][1]} L${points[1][0]} ${points[1][1]}`;
  }

  // 段斜率 m[i] = (y[i+1] - y[i]) / (x[i+1] - x[i])
  const dx: number[] = new Array(n - 1);
  const m: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dxi = points[i + 1][0] - points[i][0];
    dx[i] = dxi;
    m[i] = dxi !== 0 ? (points[i + 1][1] - points[i][1]) / dxi : 0;
  }

  // 节点切线 t[i]
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      // 符号反转或某一段为水平 → 切线为 0，确保不过冲
      t[i] = 0;
    } else {
      // 加权调和平均（用 dx 加权）
      const dxPrev = dx[i - 1];
      const dxNext = dx[i];
      const common = dxPrev + dxNext;
      t[i] =
        (3 * common) /
        ((common + dxNext) / m[i - 1] + (common + dxPrev) / m[i]);
    }
  }

  // 用切线构造三次贝塞尔
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = points[i][0];
    const y0 = points[i][1];
    const x1 = points[i + 1][0];
    const y1 = points[i + 1][1];
    const cp1x = x0 + dx[i] / 3;
    const cp1y = y0 + (t[i] * dx[i]) / 3;
    const cp2x = x1 - dx[i] / 3;
    const cp2y = y1 - (t[i + 1] * dx[i]) / 3;
    d +=
      ` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)},` +
      ` ${cp2x.toFixed(1)} ${cp2y.toFixed(1)},` +
      ` ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}
