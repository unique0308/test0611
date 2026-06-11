// 规则 2：模型异动建议（基于现有 modelTopMom 数据合成）
// 触发：
//   - mom_pct > 100%：建议评估续订成本 / 限量
//   - mom_pct < -50%：建议评估是否下架或砍价
//   - is_new && credits > 1000：本月新增爆款，建议关注稳定性
// insight_key 形如 "model_mom:<model_name>:<YYYY-MM>"，月内稳定

import { getModelTopByDateWindow } from "@/lib/db/queries";
import type { Insight } from "../types";

export async function runModelMom(): Promise<Insight[]> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const period = `${year}-${String(month + 1).padStart(2, "0")}`;

  const monthStart = new Date(Date.UTC(year, month, 1)).toISOString();
  const prevMonthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString();

  const [current, prev] = await Promise.all([
    getModelTopByDateWindow({ date_from: monthStart, limit: 50 }),
    getModelTopByDateWindow({ date_from: prevMonthStart, date_to: monthStart, limit: 50 })
  ]);

  const prevMap = new Map(prev.map((m) => [m.model_name, m.credits]));

  const out: Insight[] = [];
  for (const m of current) {
    const prevCredits = prevMap.get(m.model_name) ?? 0;
    const isNew = prevCredits === 0 && m.credits > 0;

    // 本月用量太低的不报（避免 0→100 这种夸张但无意义的异动）
    if (m.credits < 500) continue;

    if (isNew) {
      // 新模型且本月用量超过 1000 才报
      if (m.credits < 1000) continue;
      out.push({
        key: `model_mom:${m.model_name}:${period}`,
        category: "model",
        kind: "signal",
        severity: "normal",
        title: `${m.model_name} 本月新增使用，已消耗 ${m.credits.toLocaleString()} 积分`,
        body: `这是上月未出现的新模型。建议关注质量稳定性 + 单价是否合理，决定是否纳入长期供应。`,
        metrics: [
          { label: "本月用量", value: `${m.credits.toLocaleString()} 积分` },
          { label: "调用次数", value: `${m.count.toLocaleString()} 次` },
          { label: "上月用量", value: "0（新增）" }
        ],
        evidence: [
          { label: "查看用量分析", href: `/admin?focus=credit#models` }
        ],
        suggestion: "确认新模型质量后纳入长期供应，或评估是否替代某个旧模型",
        status: "active",
        dept_id: null,
        dept_name: null,
        model_name: m.model_name
      });
      continue;
    }

    if (prevCredits === 0) continue;
    const momPct = ((m.credits - prevCredits) / prevCredits) * 100;

    if (momPct > 100) {
      const severity = momPct > 200 ? "urgent" : "normal";
      out.push({
        key: `model_mom:${m.model_name}:${period}`,
        category: "model",
        kind: "signal",
        severity,
        title: `${m.model_name} 本月用量 +${Math.round(momPct)}%`,
        body: `本月 ${m.credits.toLocaleString()} 积分，上月 ${prevCredits.toLocaleString()}。涨幅显著，建议续订前评估单价/性能/同类竞品。`,
        metrics: [
          { label: "本月用量", value: `${m.credits.toLocaleString()} 积分` },
          { label: "上月用量", value: `${prevCredits.toLocaleString()} 积分` },
          { label: "环比", value: `+${Math.round(momPct)}%` }
        ],
        evidence: [{ label: "查看用量分析", href: `/admin?focus=credit#models` }],
        suggestion: "续订前对比同类模型单价，或评估是否需限量",
        status: "active",
        dept_id: null,
        dept_name: null,
        model_name: m.model_name
      });
    } else if (momPct < -50) {
      out.push({
        key: `model_mom:${m.model_name}:${period}`,
        category: "model",
        kind: "signal",
        severity: "normal",
        title: `${m.model_name} 本月用量 ${Math.round(momPct)}%`,
        body: `本月 ${m.credits.toLocaleString()} 积分，上月 ${prevCredits.toLocaleString()}。跌幅显著，建议评估是否下架或与 provider 谈降价。`,
        metrics: [
          { label: "本月用量", value: `${m.credits.toLocaleString()} 积分` },
          { label: "上月用量", value: `${prevCredits.toLocaleString()} 积分` },
          { label: "环比", value: `${Math.round(momPct)}%` }
        ],
        evidence: [{ label: "查看用量分析", href: `/admin?focus=credit#models` }],
        suggestion: "评估是否下架释放配额，或与 provider 谈降价",
        status: "active",
        dept_id: null,
        dept_name: null,
        model_name: m.model_name
      });
    }
  }

  out.sort((a, b) => (a.severity === "urgent" ? -1 : 1));
  return out;
}
