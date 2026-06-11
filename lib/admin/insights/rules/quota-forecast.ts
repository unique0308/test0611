// 规则 1：配额超额预测
// 输入：listAllDepartmentQuotas()（含 credits_used / credits_limit / usage_ratio）
// 逻辑：按今天在本月的进度线性外推月末用量，若预测值 > limit 且预测超额比 > 5%，触发洞察
//
// insight_key 形如 "quota_forecast:<dept_id>:<YYYY-MM>"，月内稳定；
// 跨月自动失效，下月新洞察自动出现

import { listAllDepartmentQuotas } from "@/lib/db/queries";
import type { Insight } from "../types";

export async function runQuotaForecast(): Promise<Insight[]> {
  const quotas = await listAllDepartmentQuotas();

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  const period = `${year}-${String(month + 1).padStart(2, "0")}`;
  // 本月已过天数（含今天） / 本月总天数
  const daysElapsed = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysRemaining = daysInMonth - daysElapsed;

  const out: Insight[] = [];
  for (const q of quotas) {
    if (q.credits_limit <= 0) continue;
    if (q.credits_used <= 0) continue;
    if (daysElapsed < 3) continue; // 月初前 3 天数据不稳定，不预测

    const dailyAvg = q.credits_used / daysElapsed;
    const forecast = q.credits_used + dailyAvg * daysRemaining;
    const overshoot = forecast - q.credits_limit;
    const overshootRatio = overshoot / q.credits_limit;

    // 已经超额了的不预测（部门看板已有红色提示）
    if (q.usage_ratio >= 1) continue;
    // 外推超额比 < 5% 视为噪音不报
    if (overshootRatio < 0.05) continue;

    // 预测到达 100% 的具体哪一天
    const daysUntilOverflow = (q.credits_limit - q.credits_used) / dailyAvg;
    const overflowDate = new Date(now);
    overflowDate.setUTCDate(now.getUTCDate() + Math.ceil(daysUntilOverflow));
    const overflowLabel = `${overflowDate.getUTCMonth() + 1} 月 ${overflowDate.getUTCDate()} 日`;

    const severity = overshootRatio >= 0.3 ? "urgent" : "normal";

    out.push({
      key: `quota_forecast:${q.department_id}:${period}`,
      category: "quota",
      kind: "alert", // 基于真实配额上限，硬指标告警
      severity,
      title: `${q.department_name} 预计本月 ${overflowLabel} 触达配额上限`,
      body: `按当前每日 ${Math.round(dailyAvg).toLocaleString()} 积分速度，月末预计消耗 ${Math.round(forecast).toLocaleString()} 积分，超出上限 ${Math.round(overshootRatio * 100)}%。`,
      metrics: [
        { label: "当前已用", value: `${Math.round(q.credits_used).toLocaleString()} / ${q.credits_limit.toLocaleString()}` },
        { label: "日均消耗", value: `${Math.round(dailyAvg).toLocaleString()} 积分` },
        { label: "预测超额", value: `+${Math.round(overshoot).toLocaleString()} 积分` }
      ],
      evidence: [
        { label: "查看部门看板", href: `/admin?dept=${q.department_id}` },
        { label: "调整配额", href: `/manage?tab=quota` }
      ],
      impact: `若不提前处理，预计月末会多出 ${Math.round(overshoot).toLocaleString()} 积分需求，可能导致月底集中追加配额或压缩必要生成。`,
      suggestion:
        overshootRatio >= 0.3
          ? `建议优先与 ${q.department_name} 负责人核对本月业务高峰，并评估是否上调配额或收敛非必要生成`
          : `建议在月内提前评估 ${q.department_name} 配额，避免月底集中处理`,
      status: "active", // index.ts 会按 insight_actions 覆写
      dept_id: q.department_id,
      dept_name: q.department_name,
      quota_context: {
        department_id: q.department_id,
        credits_used: Math.round(q.credits_used),
        credits_limit: q.credits_limit,
        // 建议上调到 forecast 的 110%（留 10% 缓冲）
        suggested_limit: Math.ceil((forecast * 1.1) / 100) * 100
      }
    });
  }

  // 按超额严重程度倒序
  out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "urgent" ? -1 : 1;
    return 0;
  });
  return out;
}
