// 趋势图时间粒度 — 纯类型和常量（无 "use client"，可在 server / client 共用）
// UI 组件 RangeToggle.tsx 是 client component，import 这里的类型；
// app/(main)/admin/page.tsx 等 server component 也 import 这里。

export type TrendRange = "7d" | "30d" | "6m" | "12m" | "4q" | "2y";
export type TrendRangePrimary = "day" | "month" | "quarter" | "year";

/** 所有可用 range，用于 page 端批量 prefetch */
export const ALL_TREND_RANGES: TrendRange[] = ["7d", "30d", "6m", "12m", "4q", "2y"];

/** 从 TrendRange 反推 primary */
export function rangePrimary(r: TrendRange): TrendRangePrimary {
  if (r === "7d" || r === "30d") return "day";
  if (r === "6m" || r === "12m") return "month";
  if (r === "4q") return "quarter";
  return "year";
}

/** 切换 primary 时的默认 sub 值 */
export function primaryDefaultRange(p: TrendRangePrimary): TrendRange {
  if (p === "day") return "30d";
  if (p === "month") return "6m";
  if (p === "quarter") return "4q";
  return "2y";
}

/** 给定 primary 的所有 sub 选项；季度/年返回空（无子选项） */
export function subRanges(p: TrendRangePrimary): Array<{ value: TrendRange; label: string }> {
  if (p === "day") {
    return [
      { value: "7d", label: "7 天" },
      { value: "30d", label: "30 天" }
    ];
  }
  if (p === "month") {
    return [
      { value: "6m", label: "6 个月" },
      { value: "12m", label: "12 个月" }
    ];
  }
  return [];
}

/** 7d/30d 走折线，其它走柱状 */
export function isBarRange(r: TrendRange): boolean {
  return r !== "7d" && r !== "30d";
}

/** 提示文案，用在 hint 位置 */
export function rangeLabel(r: TrendRange): string {
  switch (r) {
    case "7d":
      return "近 7 天 · 按日";
    case "30d":
      return "近 30 天 · 按日";
    case "6m":
      return "近 6 个月 · 按月";
    case "12m":
      return "近 12 个月 · 按月";
    case "4q":
      return "近 4 个季度";
    case "2y":
      return "近 2 年";
  }
}
