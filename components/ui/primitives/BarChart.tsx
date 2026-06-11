"use client";

import { useState } from "react";
import { useChartWidth } from "./useChartWidth";

interface Props {
  data: Array<{ [key: string]: number | string | undefined | null }>;
  height?: number;
  color?: string;
  valueKey?: string;
  labelKey?: string;
}

export function BarChart({
  data,
  height = 180,
  color = "var(--accent)",
  valueKey = "v",
  labelKey = "d"
}: Props) {
  const [ref, w] = useChartWidth(720);
  const [hover, setHover] = useState<number | null>(null);

  const padL = 44;
  const padR = 8;
  const padT = 16;
  const padB = 22;
  const chartW = w - padL - padR;
  const chartH = height - padT - padB;

  const values = data.map((d) => Number(d[valueKey] ?? 0));
  const max = (values.length ? Math.max(...values) : 1) * 1.15;
  const stepX = chartW / Math.max(1, data.length);
  const barW = Math.min(stepX * 0.6, 18);

  return (
    <div ref={ref} style={{ width: "100%", height }}>
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
                x={padL - 6}
                y={y + 3}
                fontSize="9.5"
                textAnchor="end"
                fill="var(--text-3)"
                fontFamily="var(--font-mono)"
              >
                {Math.round(max * p).toLocaleString("en-US")}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const v = Number(d[valueKey] ?? 0);
          const h = (v / (max || 1)) * chartH;
          const x = padL + i * stepX + (stepX - barW) / 2;
          const y = padT + chartH - h;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={3}
                fill={color}
                opacity={hover == null || hover === i ? 1 : 0.5}
              />
              <text
                x={x + barW / 2}
                y={height - 6}
                fontSize="10"
                textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                fill="var(--text-3)"
                fontFamily="var(--font-mono)"
              >
                {String(d[labelKey] ?? "")}
              </text>
              {hover === i && (
                <text
                  x={x + barW / 2}
                  y={y - 4}
                  fontSize="10.5"
                  textAnchor="middle"
                  fill="var(--text)"
                  fontFamily="var(--font-mono)"
                  fontWeight={600}
                >
                  {v.toLocaleString("en-US")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
