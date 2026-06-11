// 规则 4：配额冷热建议
// 与 quota-forecast（预测会超额，urgent）互补，本规则关注"长期偏冷可下调"：
//   - 月内已过 ≥ 50% 时间
//   - 但使用率 < 30% × 时间进度（即"应该用 X%，实际只用了 0.3X%"）
//   - → 建议下次月度评估时下调该部门配额
//
// "偏热"场景由 quota-forecast 已覆盖，本规则只做"偏冷"。
// insight_key "quota_fit:<dept_id>:<YYYY-MM>"

import { listAllDepartmentQuotas } from "@/lib/db/queries";
import type { Insight } from "../types";

export async function runQuotaFit(): Promise<Insight[]> {
  const quotas = await listAllDepartmentQuotas();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const period = `${year}-${String(month + 1).padStart(2, "0")}`;
  const daysElapsed = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const timeProgress = daysElapsed / daysInMonth;

  // 月初 < 50% 时间进度时，"偏冷"信号不稳定，不报
  if (timeProgress < 0.5) return [];

  const out: Insight[] = [];
  for (const q of quotas) {
    if (q.credits_limit <= 0) continue;
    // 已用比时间进度的 30% 还低，视为偏冷
    if (q.usage_ratio >= timeProgress * 0.3) continue;
    // 完全没用的部门也跳过（可能是新部门 / 暂未启用）
    if (q.credits_used === 0) continue;

    const expectedUsageByNow = q.credits_limit * timeProgress;
    const utilizationOfExpected = (q.credits_used / expectedUsageByNow) * 100;

    out.push({
      key: `quota_fit:${q.department_id}:${period}`,
      category: "quota",
      kind: "signal",
      severity: "normal",
      title: `${q.department_name} 配额可能过剩`,
      body: `已过本月 ${Math.round(timeProgress * 100)}% 时间，但只用了配额的 ${Math.round(q.usage_ratio * 100)}%（仅为按比例预期的 ${Math.round(utilizationOfExpected)}%）。`,
      metrics: [
        { label: "当前已用", value: `${Math.round(q.credits_used).toLocaleString()} / ${q.credits_limit.toLocaleString()}` },
        { label: "实际使用率", value: `${Math.round(q.usage_ratio * 100)}%` },
        { label: "时间进度", value: `${Math.round(timeProgress * 100)}%` }
      ],
      evidence: [
        { label: "查看部门看板", href: `/admin?focus=dept&dept=${q.department_id}` },
        { label: "调整配额", href: `/manage?tab=quota` }
      ],
      suggestion: "下月评估时可考虑下调配额，把额度匀给紧张的部门",
      status: "active",
      dept_id: q.department_id,
      dept_name: q.department_name,
      quota_context: {
        department_id: q.department_id,
        credits_used: Math.round(q.credits_used),
        credits_limit: q.credits_limit,
        // 建议下调到当前实际使用率 + 20% 缓冲，最小 500
        suggested_limit: Math.max(
          500,
          Math.ceil((q.credits_used * 1.2 + 200) / 100) * 100
        )
      }
    });
  }

  return out;
}
