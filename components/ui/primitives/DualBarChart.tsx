"use client";

import { useState } from "react";
import { useChartWidth } from "./useChartWidth";

interface DataPoint {
  d: string;
  img: number;
  vid: number;
  /** 可选：当日图片消耗积分（hover tooltip 显示） */
  imgCredits?: number;
  /** 可选：当日视频消耗积分（hover tooltip 显示） */
  vidCredits?: number;
}

interface Props {
  data: DataPoint[];
  height?: number;
}

/**
 * 图片+视频双色堆叠柱状图（admin/profile 14 日用量）
 * 交互：
 *   - hover 单根柱时，柱体不暗淡其他柱（克制视觉），仅当前柱顶弹出柔和卡片 tooltip
 *   - 卡片白底 + 边框 + 阴影 + 弹入缓动，展示 日期 / 图片次数·积分 / 视频次数·积分
 *   - 光标移出任意柱或离开图表区，立即 reset
 */
export function DualBarChart({ data, height = 220 }: Props) {
  const [ref, w] = useChartWidth(720);
  const [hover, setHover] = useState<number | null>(null);

  const padL = 36;
  const padR = 12;
  const padT = 28; // 顶部留更多空间给 tooltip
  const padB = 22;
  const chartW = w - padL - padR;
  const chartH = height - padT - padB;

  const max = Math.max(...data.map((d) => d.img + d.vid), 1) * 1.15;
  const stepX = chartW / Math.max(1, data.length);
  const barW = Math.min(stepX * 0.55, 22);

  // tooltip 用 div 渲染，便于自由布局与 V2 卡片风格
  const hoverPoint = hover != null ? data[hover] : null;
  const hoverX = hover != null ? padL + hover * stepX + stepX / 2 : 0;
  const hoverYBaseline =
    hover != null
      ? padT + chartH - ((data[hover].img + data[hover].vid) / max) * chartH
      : 0;

  return (
    <div
      ref={ref}
      style={{ width: "100%", height, position: "relative" }}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={w} height={height} style={{ display: "block" }}>
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
                {Math.round((max * p) / 1000)}k
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const hImg = (d.img / max) * chartH;
          const hVid = (d.vid / max) * chartH;
          const x = padL + i * stepX + (stepX - barW) / 2;
          const yImg = padT + chartH - hImg;
          const yVid = yImg - hVid;
          const isHover = hover === i;
          return (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            >
              {/* 透明加宽 hit-area，提升 hover 命中率 */}
              <rect
                x={padL + i * stepX}
                y={padT}
                width={stepX}
                height={chartH}
                fill="transparent"
              />
              <rect
                x={x}
                y={yVid}
                width={barW}
                height={hVid}
                rx={2}
                fill="var(--violet)"
                style={{
                  transition: "filter .15s ease, transform .15s ease",
                  filter: isHover ? "brightness(1.05)" : "none"
                }}
              />
              <rect
                x={x}
                y={yImg + 1}
                width={barW}
                height={Math.max(0, hImg - 1)}
                rx={2}
                fill="var(--accent)"
                style={{
                  transition: "filter .15s ease, transform .15s ease",
                  filter: isHover ? "brightness(1.05)" : "none"
                }}
              />
              {(i % 2 === 0 || i === data.length - 1) && (
                <text
                  x={x + barW / 2}
                  y={height - 6}
                  fontSize="10"
                  textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                  fill="var(--text-3)"
                  fontFamily="var(--font-mono)"
                >
                  {d.d}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip — V2 风格白底浮窗，弹入缓动 */}
      {hoverPoint && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: hoverX,
            top: Math.max(0, hoverYBaseline - 12),
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
          <TooltipRow
            color="var(--accent)"
            label="图片"
            count={hoverPoint.img}
            credits={hoverPoint.imgCredits}
          />
          <TooltipRow
            color="var(--violet)"
            label="视频"
            count={hoverPoint.vid}
            credits={hoverPoint.vidCredits}
          />
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

function TooltipRow({
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
      <span
        className="num fw-6"
        style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}
      >
        {count}
      </span>
      <span style={{ color: "var(--text-3)", fontSize: 11 }}>次</span>
      {credits != null && (
        <>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span
            className="num"
            style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}
          >
            {credits.toLocaleString("en-US")}
          </span>
          <span style={{ color: "var(--text-3)", fontSize: 11 }}>积分</span>
        </>
      )}
    </div>
  );
}
