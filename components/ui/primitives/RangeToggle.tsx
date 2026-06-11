"use client";

import {
  type TrendRange,
  type TrendRangePrimary,
  primaryDefaultRange,
  rangePrimary
} from "./trend-range";

// 仅 primary 切换（日 / 月 / 季度 / 年）— 固定 4 按钮等宽，**切换不引起布局变化**
// 子选项（7 天/30 天、6 月/12 月）移到 hint 区，由 SubRangePicker 处理

const PRIMARY_OPTIONS: Array<{ value: TrendRangePrimary; label: string }> = [
  { value: "day", label: "日" },
  { value: "month", label: "月" },
  { value: "quarter", label: "季度" },
  { value: "year", label: "年" }
];

interface Props {
  value: TrendRange;
  onChange: (v: TrendRange) => void;
}

export function RangeToggle({ value, onChange }: Props) {
  const primary = rangePrimary(value);
  return (
    <div className="seg-btns" role="radiogroup" aria-label="时间粒度">
      {PRIMARY_OPTIONS.map((opt) => (
        <span
          key={opt.value}
          className={`seg-btn ${primary === opt.value ? "active" : ""}`}
          onClick={() => onChange(primaryDefaultRange(opt.value))}
          role="radio"
          aria-checked={primary === opt.value}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(primaryDefaultRange(opt.value));
            }
          }}
        >
          {opt.label}
        </span>
      ))}
    </div>
  );
}
