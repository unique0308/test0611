"use client";

import { CountUp } from "./CountUp";
import { fmtInt } from "./format";

interface Props {
  label: string;
  value: number;
  dotColor: string;
  foot?: string;
  prefix?: string;
}

/** 小型统计卡（admin Spend 4 宫格 / profile 用） */
export function StatMini({ label, value, dotColor, foot, prefix = "" }: Props) {
  return (
    <div className="stat-mini">
      <div className="stat-mini-head">
        <span className="stat-mini-dot" style={{ background: dotColor }} />
        <span className="stat-mini-label">{label}</span>
      </div>
      <div className="stat-mini-num">
        {prefix}
        <CountUp value={value} fmt={fmtInt} />
      </div>
      {foot && <div className="stat-mini-foot">{foot}</div>}
    </div>
  );
}
