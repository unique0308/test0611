// 稀疏趋势数据填充 — 仅用于演示阶段查看"完整呈现形态"
// 触发条件：超过 50% 桶为 0 时认为是稀疏数据，自动用合成值填补
// 真实数据足够时不触发，所以生产环境无影响
//
// 关掉方法：设环境变量 `DISABLE_TREND_DEMO_FILL=1`

import type { TrendPoint } from "@/lib/db/queries";

const ENABLE = process.env.DISABLE_TREND_DEMO_FILL !== "1";

/** 判断是否稀疏（≥50% 桶 credits==0） */
function isSparse(trend: { credits: number }[]): boolean {
  if (trend.length === 0) return false;
  const zero = trend.filter((p) => (p.credits ?? 0) === 0).length;
  return zero / trend.length > 0.5;
}

/** 生成合成数值：慢正弦波 + 随机噪声，base 由现有非零均值估算 */
function syntheticValue(i: number, n: number, base: number): number {
  const wave = Math.sin((i / Math.max(1, n - 1)) * Math.PI * 1.7) * 0.35;
  const noise = (Math.random() - 0.5) * 0.4;
  return Math.max(20, Math.round(base * (1 + wave + noise)));
}

/** 对单线 TrendPoint[] 做稀疏填充（管理者看板单部门用） */
export function fillSparseTrend(trend: TrendPoint[], baselineCredits = 800): TrendPoint[] {
  if (!ENABLE || !isSparse(trend)) return trend;
  const nonZero = trend.map((p) => p.credits).filter((c) => c > 0);
  const base = nonZero.length > 0
    ? nonZero.reduce((s, c) => s + c, 0) / nonZero.length
    : baselineCredits;
  return trend.map((p, i) => {
    if (p.credits > 0) return p;
    const credits = syntheticValue(i, trend.length, base);
    return { ...p, credits, calls: Math.max(1, Math.round(credits / 12)) };
  });
}

/** 多部门 series 填充 — 给 MultiTrend.series 用 */
export function fillSparseMultiTrendSeries<
  S extends { points: Array<{ key: string; credits: number; calls: number }> }
>(series: S, baselineCredits = 800): S {
  if (!ENABLE || !isSparse(series.points)) return series;
  const nonZero = series.points.map((p) => p.credits).filter((c) => c > 0);
  const base = nonZero.length > 0
    ? nonZero.reduce((s, c) => s + c, 0) / nonZero.length
    : baselineCredits;
  return {
    ...series,
    points: series.points.map((p, i) => {
      if (p.credits > 0) return p;
      const credits = syntheticValue(i, series.points.length, base);
      return { ...p, credits, calls: Math.max(1, Math.round(credits / 12)) };
    })
  };
}

// ─── 模型环比 demo fixture ─────────────────────────────────────
// 当上月数据基本为空（早期 dev / 项目首月）时，给每个模型生成 plausible 上月数据
// 让 admin 能看到完整的"NEW / 涨 / 跌"信号，验证 UI 逻辑

interface ModelRow {
  model_name: string;
  count: number;
  credits: number;
}

interface ModelMomRow extends ModelRow {
  prev_credits: number;
  mom_pct: number | null;
  is_new: boolean;
}

// 不同位次对应的涨跌目标分布（精心安排：NEW / 大涨 / 中涨 / 平稳 / 小跌 / 大跌 全覆盖）
const DEMO_MOM_TARGETS = [
  +156, // 大涨（典型采购候选）
  null, // NEW（首次出现）
  +42, // 中涨
  +8, // 平稳偏涨（< 5% 不显示徽章，演示"无变化"态）
  -22, // 小跌
  null, // NEW
  +85, // 大涨
  -58, // 大跌（萎缩候选）
  +12,
  -8 // 平稳偏跌
];

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 判断 prev 数据是否稀疏：上月总量 < 当月 10% 或上月条目 < 当月 30% */
function isPrevSparse(modelTop: ModelRow[], modelTopPrev: ModelRow[]): boolean {
  if (modelTop.length === 0) return false;
  const currTotal = modelTop.reduce((s, m) => s + m.credits, 0);
  const prevTotal = modelTopPrev.reduce((s, m) => s + m.credits, 0);
  if (currTotal === 0) return false;
  return prevTotal < currTotal * 0.1 || modelTopPrev.length < modelTop.length * 0.3;
}

/**
 * 合成"模型异动"数据：
 *   - 数据足够时直接用真实环比
 *   - 稀疏时按模型名哈希分配 demo 涨跌目标（同一模型每次结果稳定，不会刷新跳变）
 */
export function fillSparseModelMom(
  modelTop: ModelRow[],
  modelTopPrev: ModelRow[]
): ModelMomRow[] {
  const prevMap = new Map(modelTopPrev.map((m) => [m.model_name, m]));

  // 真实数据通路
  if (!ENABLE || !isPrevSparse(modelTop, modelTopPrev)) {
    return modelTop.map((m) => {
      const prev = prevMap.get(m.model_name);
      if (!prev || prev.credits === 0) {
        return { ...m, prev_credits: 0, mom_pct: null, is_new: true };
      }
      const mom = ((m.credits - prev.credits) / prev.credits) * 100;
      return {
        ...m,
        prev_credits: prev.credits,
        mom_pct: Math.round(mom * 10) / 10,
        is_new: false
      };
    });
  }

  // demo 通路：稳定哈希分配涨跌
  return modelTop.map((m) => {
    const slot = stableHash(m.model_name) % DEMO_MOM_TARGETS.length;
    const target = DEMO_MOM_TARGETS[slot];
    if (target === null) {
      return { ...m, prev_credits: 0, mom_pct: null, is_new: true };
    }
    // 反推上月：当月 / (1 + target/100)
    const prev = Math.max(1, Math.round(m.credits / (1 + target / 100)));
    const actualMom = ((m.credits - prev) / prev) * 100;
    return {
      ...m,
      prev_credits: prev,
      mom_pct: Math.round(actualMom * 10) / 10,
      is_new: false
    };
  });
}
