"use client";

import { useState } from "react";
import { useChartWidth } from "./useChartWidth";

interface DataPoint {
  d: string;
  img: number;
  vid: number;
  imgCredits?: number;
  vidCredits?: number;
}

interface Props {
  data: DataPoint[];
  height?: number;
}

/**
 * 分组柱状图 — 每个时间点两根并列柱（图/视频）
 * 区别于 DualBarChart（堆叠）：这里是 side-by-side，便于直接比较两类的绝对量
 * 交互：
 *   - hover 整个时间组 → 其他组暗淡到 0.35，当前组保持 1.0
 *   - hover 卡片显示该组日期 / 图次数+积分 / 视频次数+积分
 *   - 光标离开图表区即恢复
 */
export function GroupedBarChart({ data, height = 220 }: Props) {
  const [ref, w] = useChartWidth(720);
  const [hover, setHover] = useState<number | null>(null);

  const padL = 36;
  const padR = 12;
  const padT = 28;
  const padB = 22;
  const chartW = w - padL - padR;
  const chartH = height - padT - padB;

  const max = Math.max(...data.map((d) => Math.max(d.img, d.vid)), 1) * 1.15;
  const stepX = chartW / Math.max(1, data.length);
  // 两根柱并列：组总宽 = 2 × barW + 2px gap；占 stepX 的 50% 左右
  const barW = Math.min(stepX * 0.22, 14);
  const barGap = 2;
  const groupW = barW * 2 + barGap;

  const hoverPoint = hover != null ? data[hover] : null;
  const hoverGroupCenter = hover != null ? padL + hover * stepX + stepX / 2 : 0;
  const hoverTop =
    hover != null
      ? padT + chartH - (Math.max(data[hover].img, data[hover].vid) / max) * chartH
      : 0;

  return (
    <div
      ref={ref}
      style={{ width: "100%", height, position: "relative" }}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={w} height={height} style={{ display: "block" }}>
        {/* y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = padT + chartH - p * chartH;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray={p === 0 ? "0" : "2 3"}
              />
              <text
                x={padL - 8}
                y={y + 3}
                fontSize="10"
                textAnchor="end"
                fill="var(--text-3)"
                fontFamily="var(--font-mono)"
              >
                {Math.round(max * p) >= 1000
                  ? Math.round((max * p) / 1000) + "k"
                  : Math.round(max * p)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const hImg = (d.img / max) * chartH;
          const hVid = (d.vid / max) * chartH;
          const centerX = padL + i * stepX + stepX / 2;
          const imgX = centerX - groupW / 2;
          const vidX = imgX + barW + barGap;
          const yImg = padT + chartH - hImg;
          const yVid = padT + chartH - hVid;
          const isHover = hover === i;
          const dim = hover != null && !isHover;
          const showLabel = data.length <= 4 || i % Math.ceil(data.length / 8) === 0;

          return (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              style={{ cursor: "pointer" }}
            >
              {/* 透明 hit-area 覆盖整组 */}
              <rect
                x={padL + i * stepX}
                y={padT}
                width={stepX}
                height={chartH}
                fill="transparent"
              />
              {/* 图片柱 */}
              <rect
                x={imgX}
                y={yImg}
                width={barW}
                height={hImg}
                rx={2}
                fill="var(--accent)"
                style={{
                  opacity: dim ? 0.35 : 1,
                  transition: "opacity .15s ease"
                }}
              />
              {/* 视频柱 */}
              <rect
                x={vidX}
                y={yVid}
                width={barW}
                height={hVid}
                rx={2}
                fill="var(--violet)"
                style={{
                  opacity: dim ? 0.35 : 1,
                  transition: "opacity .15s ease"
                }}
              />
              {/* X 轴标签 — 首末点用 start/end 对齐避免溢出 */}
              {showLabel && (
                <text
                  x={centerX}
                  y={height - 6}
                  fontSize="10"
                  textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                  fill="var(--text-3)"
                  fontFamily="var(--font-mono)"
                  style={{ opacity: dim ? 0.5 : 1, transition: "opacity .15s ease" }}
                >
                  {d.d}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip — 仅 hover 时出现，柔和白底浮窗 */}
      {hoverPoint && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: hoverGroupCenter,
            top: Math.max(0, hoverTop - 12),
            transform: "translate(-50%, -100%)",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "var(--sh-md)",
            padding: "8px 12px",
            minWidth: 132,
            pointerEvents: "none",
            animation: "tt-pop .14s cubic-bezier(.34,1.56,.64,1) both",
            zIndex: 5
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.02em",
              marginBottom: 4
            }}
          >
            {hoverPoint.d}
          </div>
          <Row color="var(--accent)" label="图片" count={hoverPoint.img} credits={hoverPoint.imgCredits} />
          <Row color="var(--violet)" label="视频" count={hoverPoint.vid} credits={hoverPoint.vidCredits} />
        </div>
      )}

      <style>{`
        @keyframes tt-pop {
          from { opacity: 0; transform: translate(-50%, calc(-100% + 4px)) scale(.96); }
          to { opacity: 1; transform: translate(-50%, -100%) scale(1); }
        }
      `}</style>
    </div>
  );
}

function Row({
  color,
  label,
  count,
  credits
}: {
  color: string;
  label: string;
  count: number;
  credits?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        marginTop: 2,
        whiteSpace: "nowrap"
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ color: "var(--text-2)", minWidth: 24 }}>{label}</span>
      <span className="num fw-6" style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>
        {count}
      </span>
      <span style={{ color: "var(--text-3)", fontSize: 11 }}>次</span>
      {credits != null && (
        <>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span className="num" style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>
            {credits.toLocaleString("en-US")}
          </span>
          <span style={{ color: "var(--text-3)", fontSize: 11 }}>积分</span>
        </>
      )}
    </div>
  );
}
