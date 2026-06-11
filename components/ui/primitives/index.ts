// V2 视觉基础组件 — 桶式导出
// 来源：原型设计V2/_extract/src/primitives.jsx

export { useCountUp } from "./useCountUp";
export { useChartWidth } from "./useChartWidth";
export { CountUp } from "./CountUp";
export { Sparkline } from "./Sparkline";
export { KPI, type KpiData, type KpiAccent, type DeltaDir } from "./KPI";
export { Tabs, type TabItem } from "./Tabs";
export { TrendChart, type TrendSeries } from "./TrendChart";
export { BarChart } from "./BarChart";
export { DualBarChart } from "./DualBarChart";
export { StatusBadge, type StatusKey } from "./StatusBadge";
export { StatMini } from "./StatMini";
export { Lightbox, type LightboxSource } from "./Lightbox";
export { fmtInt, fmtCurrency, fmtPct, fmtCompact } from "./format";
export { RangeToggle } from "./RangeToggle";
export { SubRangePicker } from "./SubRangePicker";
export { ChartTypeToggle, type ChartType } from "./ChartTypeToggle";
export { GroupedBarChart } from "./GroupedBarChart";
export {
  isBarRange,
  rangeLabel,
  rangePrimary,
  primaryDefaultRange,
  subRanges,
  ALL_TREND_RANGES,
  type TrendRange,
  type TrendRangePrimary
} from "./trend-range";
