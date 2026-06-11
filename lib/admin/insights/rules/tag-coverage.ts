// 规则 5：用途标签覆盖率告警
// 触发：本月任务中 purpose_tag_name="未分类" 占比 > 70%
// 商业价值：暴露员工跳过 purpose_tag 选择的产品问题——这不是数据洞察，是产品交互问题
// insight_key 形如 "tag_coverage:overall:<YYYY-MM>"，月内稳定

import { getServerClient } from "@/lib/supabase/server";
import type { Insight } from "../types";

const UNCATEGORIZED = "未分类";

export async function runTagCoverage(): Promise<Insight[]> {
  const supabase = getServerClient();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const period = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthStart = new Date(Date.UTC(year, month, 1)).toISOString();

  const { data } = await supabase
    .from("generation_tasks")
    .select("purpose_tag_name")
    .eq("status", "succeeded")
    .gte("created_at", monthStart);

  const rows = (data ?? []) as Array<{ purpose_tag_name: string }>;
  if (rows.length < 30) return []; // 样本太少时不报，避免噪音

  let uncategorized = 0;
  for (const r of rows) {
    if (r.purpose_tag_name === UNCATEGORIZED) uncategorized++;
  }
  const uncategorizedPct = uncategorized / rows.length;
  if (uncategorizedPct <= 0.7) return [];

  const severity = uncategorizedPct >= 0.9 ? "urgent" : "normal";
  return [
    {
      key: `tag_coverage:overall:${period}`,
      category: "user",
      kind: "alert", // 产品配置问题（员工没填标签），硬指标告警
      severity,
      title: `本月 ${Math.round(uncategorizedPct * 100)}% 任务未选用途标签`,
      body: `共 ${rows.length} 个 succeeded 任务，其中 ${uncategorized} 个 purpose_tag_name="未分类"。员工可能在跳过该字段，长期会让"使用目的分布"统计失真，影响 admin 决策。`,
      metrics: [
        { label: "本月任务", value: rows.length.toLocaleString() },
        { label: "未分类", value: `${uncategorized.toLocaleString()} (${Math.round(uncategorizedPct * 100)}%)` },
        { label: "已分类", value: `${(rows.length - uncategorized).toLocaleString()} (${Math.round((1 - uncategorizedPct) * 100)}%)` }
      ],
      evidence: [
        { label: "查看用途分布", href: `/admin?focus=credit#purposes` },
        { label: "查看用途标签", href: `/manage?tab=purposes` }
      ],
      impact: "用途标签覆盖率过低会让场景分布、部门需求和模型采购判断失真，后续很难解释预算为什么增长。",
      suggestion:
        uncategorizedPct >= 0.9
          ? "建议检查生成页 prompt 区是否把用途选择放得太深；考虑在 V2 改为必填或加引导"
          : `建议在生成页给用途选择加引导文案（默认提示"请选择业务场景"），或加智能推荐`,
      status: "active",
      dept_id: null,
      dept_name: null
    }
  ];
}
