// AI 洞察 · 聚合入口
// 调用方：app/(main)/admin/insights/page.tsx
// 每次访问实时跑全部规则 → 与 insight_actions LEFT JOIN → 返回带 status 的 InsightGroup[]

import { CATEGORY_LABEL, type Insight, type InsightCategory, type InsightGroup } from "./types";
import { getActionMap } from "./actions";
import { runQuotaForecast } from "./rules/quota-forecast";
import { runModelMom } from "./rules/model-mom";
import { runUserSpike } from "./rules/user-spike";
import { runQuotaFit } from "./rules/quota-fit";
import { runTagCoverage } from "./rules/tag-coverage";

export type { Insight, InsightCategory, InsightGroup, InsightSeverity, InsightStatus } from "./types";
export { CATEGORY_LABEL } from "./types";
export { recordAction, resetAction, getActionHistory } from "./actions";

const ALL_CATEGORIES: InsightCategory[] = ["quota", "model", "spend", "user"];

export type ComputeResult = {
  /** 紧急洞察（severity=urgent 且 active） */
  urgent: Insight[];
  /** 按分类分组，每组包含全部状态（active / ignored / actioned） */
  groups: InsightGroup[];
  /** active 总数，给侧边栏 badge 用 */
  activeCount: number;
  /** 按分类的 active 计数，给 banner 角标用 */
  activeByCategory: Record<InsightCategory, number>;
  /** alert 类 active 计数（基于硬指标的告警） */
  activeAlertCount: number;
  /** signal 类 active 计数（观察性数据信号） */
  activeSignalCount: number;
  /** alert 中紧急的子集（admin 真正要立即处理的） */
  urgentAlerts: Insight[];
};

export async function computeInsights(): Promise<ComputeResult> {
  // 并行跑全部规则
  const ruleResults = await Promise.all([
    runQuotaForecast(),
    runModelMom(),
    runUserSpike(),
    runQuotaFit(),
    runTagCoverage()
  ]);
  const candidates: Insight[] = ruleResults.flat();

  // LEFT JOIN insight_actions，给每条洞察打 status
  const keys = candidates.map((c) => c.key);
  const actionMap = await getActionMap(keys);
  const insights: Insight[] = candidates.map((c) => {
    const a = actionMap.get(c.key);
    return { ...c, status: a ? a.action_type : "active" };
  });

  const groups: InsightGroup[] = ALL_CATEGORIES.map((cat) => ({
    category: cat,
    label: CATEGORY_LABEL[cat],
    insights: insights.filter((i) => i.category === cat)
  }));

  const urgent = insights.filter((i) => i.severity === "urgent" && i.status === "active");
  const urgentAlerts = urgent.filter((i) => i.kind === "alert");
  const activeCount = insights.filter((i) => i.status === "active").length;
  const activeAlertCount = insights.filter(
    (i) => i.status === "active" && i.kind === "alert"
  ).length;
  const activeSignalCount = insights.filter(
    (i) => i.status === "active" && i.kind === "signal"
  ).length;
  const activeByCategory: Record<InsightCategory, number> = {
    quota: 0,
    model: 0,
    spend: 0,
    user: 0
  };
  for (const i of insights) {
    if (i.status === "active") activeByCategory[i.category]++;
  }

  return {
    urgent,
    urgentAlerts,
    groups,
    activeCount,
    activeAlertCount,
    activeSignalCount,
    activeByCategory
  };
}
