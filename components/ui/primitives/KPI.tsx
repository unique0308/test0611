"use client";

import type { CSSProperties } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { CountUp } from "./CountUp";
import { fmtInt, fmtCompact } from "./format";

export type KpiAccent = "accent" | "violet" | "success" | "warn";
export type DeltaDir = "up" | "down" | "flat";

export interface KpiData {
  key: string;
  label: string;
  value: number;
  unit?: string;
  /** 金额型，数值前显示前缀（默认 ¥） */
  isPrefix?: boolean;
  prefix?: string;
  delta?: number;
  deltaDir?: DeltaDir;
  prev?: number;
  prevLabel?: string;
  foot?: string;
  icon: IconName;
  accent?: KpiAccent;
  /** 高亮/告警态：黄色 attention 渐变背景 */
  attention?: boolean;
  /** 显示底部「前往 XXX」入口提示（行动型 KPI） */
  link?: boolean;
  /** 自定义 link 提示文案（默认"前往处理"，仅 link=true 时生效） */
  linkLabel?: string;
  /** link hint 颜色（默认 warn 橙色，可改成主色等） */
  linkColor?: string;
}

interface Props {
  k: KpiData;
  onClick?: () => void;
  /** 是否可选中（KPI 切换 context panel 场景） */
  selectable?: boolean;
  /** 选中态（active） */
  active?: boolean;
}

const ACCENT_MAP: Record<KpiAccent, string> = {
  accent: "var(--accent)",
  violet: "var(--violet)",
  success: "var(--success)",
  warn: "var(--warn)"
};

export function KPI({ k, onClick, selectable = false, active = false }: Props) {
  const accent = k.accent ?? "accent";
  const accentColor = ACCENT_MAP[accent];
  const showCompare = k.prev != null;

  const style: CSSProperties = active ? ({ ["--kpi-accent" as string]: accentColor } as CSSProperties) : {};

  const deltaIcon: IconName =
    k.deltaDir === "up" ? "arrowUp" : k.deltaDir === "down" ? "arrowDown" : "arrow";
  const deltaCls =
    k.deltaDir === "up" ? "delta-up" : k.deltaDir === "down" ? "delta-down" : "delta-flat";

  const clickable = onClick != null || k.link;

  return (
    <div
      className={`kpi ${clickable ? "clickable" : ""} ${selectable ? "kpi-switch" : ""} ${active ? "active" : ""} ${k.attention ? "attention" : ""}`}
      onClick={onClick}
      style={style}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="kpi-head">
        <div className="kpi-label">{k.label}</div>
        <div className={`kpi-icon-block ${accent}`}>
          <Icon name={k.icon} size={14} />
        </div>
      </div>

      <div className="kpi-value">
        {k.isPrefix ? (
          <span className="kpi-num">
            {k.prefix ?? "¥"}
            <CountUp value={k.value} fmt={fmtInt} />
          </span>
        ) : (
          <span className="kpi-num">
            <CountUp value={k.value} fmt={fmtInt} />
          </span>
        )}
        {k.unit && !k.isPrefix && <span className="kpi-unit">{k.unit}</span>}
      </div>

      {showCompare ? (
        <div className="kpi-compare">
          <div className="kpi-compare-meta">
            {k.delta != null && (
              <span className={`delta ${deltaCls}`}>
                <Icon name={deltaIcon} size={10} />
                {Math.abs(k.delta)}%
              </span>
            )}
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              {k.prevLabel ?? "上月"}{" "}
              <span className="num" style={{ color: "var(--text-2)", fontWeight: 500 }}>
                {k.isPrefix ? k.prefix ?? "¥" : ""}
                {fmtCompact(k.prev!)}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <div className="kpi-foot-simple">
          {k.delta != null && (
            <span className={`delta ${deltaCls}`}>
              <Icon name={deltaIcon} size={10} />
              {Math.abs(k.delta)}%
            </span>
          )}
          {k.foot && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{k.foot}</span>}
        </div>
      )}

      {selectable && (
        <div className="kpi-switch-hint">
          {active ? "当前展开" : "查看详情"}
          <Icon name={active ? "check" : "chev"} size={11} />
        </div>
      )}
      {k.link && (
        <div
          className="kpi-switch-hint"
          style={{ color: k.linkColor ?? "var(--warn)" }}
        >
          {k.linkLabel ?? "前往处理"} <Icon name="arrow" size={11} />
        </div>
      )}
    </div>
  );
}
