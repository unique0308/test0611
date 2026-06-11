"use client";

import { useId } from "react";
import { useChartWidth } from "./useChartWidth";

interface Props {
  data: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}

export function Sparkline({
  data,
  color = "var(--accent)",
  height = 32,
  fill = true
}: Props) {
  const [ref, w] = useChartWidth(160);
  const id = useId();
  const gradId = `sp-${id.replace(/[^a-zA-Z0-9]/g, "")}`;

  if (data.length === 0) {
    return <div ref={ref} style={{ width: "100%", height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / Math.max(1, data.length - 1);
  const points = data.map<[number, number]>((v, i) => [
    i * stepX,
    height - 4 - ((v - min) / range) * (height - 8)
  ]);
  const path = points
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ");
  const area = path + ` L${w} ${height} L0 ${height} Z`;

  const last = points[points.length - 1];

  return (
    <div ref={ref} style={{ width: "100%", height }}>
      <svg width={w} height={height} style={{ display: "block" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {fill && <path d={area} fill={`url(#${gradId})`} />}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />
      </svg>
    </div>
  );
}
