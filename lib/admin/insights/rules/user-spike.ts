// 规则 3：员工用量异常突增
// 触发：本周（最近 7 天）vs 上周（再往前 7 天）
//   - 本周积分 ≥ 100（避免低基数噪音）
//   - 本周/上周 ≥ 3 倍（或上周为 0 而本周 ≥ 500）
// insight_key "user_spike:<user_id>:<YYYY-WW>"，本周内稳定，下周自动失效
//
// 本规则在 rule 内直接查 supabase，不向 lib/db/queries.ts 加 helper
// （因为只有这一处使用 by-user 聚合）

import { getServerClient } from "@/lib/supabase/server";
import type { Insight } from "../types";

type WeekAgg = { user_id: string; credits: number };

async function aggregateByUser(fromIso: string, toIso: string): Promise<WeekAgg[]> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("generation_tasks")
    .select("user_id, credits_cost")
    .eq("status", "succeeded")
    .gte("created_at", fromIso)
    .lt("created_at", toIso);
  if (error) throw error;

  const map = new Map<string, number>();
  for (const r of (data ?? []) as Array<{
    user_id: string | null;
    credits_cost: number | string | null;
  }>) {
    if (!r.user_id) continue;
    map.set(r.user_id, (map.get(r.user_id) ?? 0) + (Number(r.credits_cost) || 0));
  }
  return [...map.entries()].map(([user_id, credits]) => ({ user_id, credits }));
}

function isoWeekLabel(d: Date): string {
  // ISO 周编号简化版：年 + 当年第 N 周
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((d.getTime() - start.getTime()) / (24 * 3600 * 1000));
  const week = Math.floor((dayOfYear + start.getUTCDay()) / 7) + 1;
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function runUserSpike(): Promise<Insight[]> {
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setUTCDate(now.getUTCDate() - 7);
  const prevWeekStart = new Date(now);
  prevWeekStart.setUTCDate(now.getUTCDate() - 14);

  const [thisWeek, prevWeek] = await Promise.all([
    aggregateByUser(thisWeekStart.toISOString(), now.toISOString()),
    aggregateByUser(prevWeekStart.toISOString(), thisWeekStart.toISOString())
  ]);

  const prevMap = new Map(prevWeek.map((r) => [r.user_id, r.credits]));

  const candidates: Array<{
    user_id: string;
    this_credits: number;
    prev_credits: number;
    ratio: number;
  }> = [];
  for (const t of thisWeek) {
    if (t.credits < 100) continue;
    const prev = prevMap.get(t.user_id) ?? 0;
    if (prev === 0 && t.credits < 500) continue; // 新激活用户阈值更高
    const ratio = prev === 0 ? Infinity : t.credits / prev;
    if (ratio >= 3) {
      candidates.push({ user_id: t.user_id, this_credits: t.credits, prev_credits: prev, ratio });
    }
  }

  if (candidates.length === 0) return [];

  // 取用户姓名 / 部门 — 一次查全部
  const supabase = getServerClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, name, department_id, departments(name)")
    .in(
      "id",
      candidates.map((c) => c.user_id)
    );
  type UserRow = {
    id: string;
    name: string;
    department_id: string | null;
    departments: { name: string } | { name: string }[] | null;
  };
  const userMap = new Map<string, { name: string; dept_id: string | null; dept_name: string | null }>();
  for (const u of ((users as unknown) as UserRow[]) ?? []) {
    const d = Array.isArray(u.departments) ? u.departments[0] : u.departments;
    userMap.set(u.id, { name: u.name, dept_id: u.department_id, dept_name: d?.name ?? null });
  }

  const weekKey = isoWeekLabel(now);
  const out: Insight[] = [];
  for (const c of candidates) {
    const u = userMap.get(c.user_id);
    if (!u) continue;
    const ratioLabel =
      c.prev_credits === 0
        ? "新激活"
        : `${c.ratio.toFixed(1)} 倍`;
    out.push({
      key: `user_spike:${c.user_id}:${weekKey}`,
      category: "user",
      kind: "signal",
      severity: c.ratio >= 5 || c.prev_credits === 0 ? "urgent" : "normal",
      title: `${u.name}${u.dept_name ? `（${u.dept_name}）` : ""} 本周用量${c.prev_credits === 0 ? "新激活并显著消耗" : `异常增长（${ratioLabel}）`}`,
      body: `本周 ${c.this_credits.toLocaleString()} 积分，上周 ${c.prev_credits.toLocaleString()} 积分。建议确认是否为业务高峰或异常使用。`,
      metrics: [
        { label: "本周积分", value: c.this_credits.toLocaleString() },
        { label: "上周积分", value: c.prev_credits.toLocaleString() },
        { label: "倍数", value: ratioLabel }
      ],
      evidence: u.dept_id
        ? [{ label: "查看部门成员", href: `/admin?focus=dept&dept=${u.dept_id}#members` }]
        : [],
      suggestion: "如确认业务必要可忽略；若疑似异常，与该员工或部门负责人核对",
      status: "active",
      dept_id: u.dept_id ?? null,
      dept_name: u.dept_name ?? null
    });
  }

  out.sort((a, b) => (a.severity === "urgent" ? -1 : 1));
  return out;
}
