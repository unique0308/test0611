"use client";

// 图表形态切换：曲线 / 柱状
// 与 RangeToggle 平级使用；不依赖 range，用户可任意搭配

export type ChartType = "line" | "bar";

interface Props {
  value: ChartType;
  onChange: (v: ChartType) => void;
}

export function ChartTypeToggle({ value, onChange }: Props) {
  return (
    <div className="seg-btns" role="radiogroup" aria-label="图表形态" style={{ flexShrink: 0 }}>
      <span
        className={`seg-btn ${value === "line" ? "active" : ""}`}
        onClick={() => onChange("line")}
        role="radio"
        aria-checked={value === "line"}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChange("line");
          }
        }}
        title="曲线图"
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <LineIcon />
        曲线
      </span>
      <span
        className={`seg-btn ${value === "bar" ? "active" : ""}`}
        onClick={() => onChange("bar")}
        role="radio"
        aria-checked={value === "bar"}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChange("bar");
          }
        }}
        title="柱状图"
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <BarIcon />
        柱状
      </span>
    </div>
  );
}

function LineIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l5-6 4 3 4-7 5 5" />
    </svg>
  );
}

function BarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 20V10M11 20V4M17 20v-7" />
    </svg>
  );
}
