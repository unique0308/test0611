// 读 / 写 insight_actions 表
// 用户的"忽略 / 已处理"操作走这里，对外暴露：
//   - getActionMap：取一组 insight_key → 最新 action 的映射，给 computeInsights 用
//   - recordAction：插一行记录，给 POST /api/admin/insights/actions 用

import { getServerClient } from "@/lib/supabase/server";

export type InsightAction = {
  insight_key: string;
  action_type: "ignored" | "actioned";
  actor_id: string;
  acted_at: string;
  note: string | null;
};

/** 取每条 key 的"最新一条" action，方便 LEFT JOIN 用 */
export async function getActionMap(
  keys: string[]
): Promise<Map<string, InsightAction>> {
  if (keys.length === 0) return new Map();
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("insight_actions")
    .select("insight_key, action_type, actor_id, acted_at, note")
    .in("insight_key", keys)
    .order("acted_at", { ascending: false });
  if (error) throw error;

  const map = new Map<string, InsightAction>();
  for (const row of (data ?? []) as InsightAction[]) {
    // 已按 acted_at desc 排序，第一次见到的 key 即最新
    if (!map.has(row.insight_key)) map.set(row.insight_key, row);
  }
  return map;
}

export async function recordAction(input: {
  insight_key: string;
  action_type: "ignored" | "actioned";
  actor_id: string;
  note?: string;
}): Promise<void> {
  const supabase = getServerClient();
  const { error } = await supabase.from("insight_actions").insert({
    insight_key: input.insight_key,
    action_type: input.action_type,
    actor_id: input.actor_id,
    note: input.note ?? null
  });
  if (error) throw error;
}

/** 撤回 — 删除该 insight_key 全部 actions，让它回到 active 状态
 *  审计痕迹通过 audit_logs.admin_insight_reverted 留存，不污染 insight_actions 表 */
export async function resetAction(insight_key: string): Promise<void> {
  const supabase = getServerClient();
  const { error } = await supabase
    .from("insight_actions")
    .delete()
    .eq("insight_key", insight_key);
  if (error) throw error;
}

/** 取该 key 的操作历史（按时间倒序，最新一条在前） */
export async function getActionHistory(
  insight_key: string,
  limit = 5
): Promise<
  Array<{
    action_type: "ignored" | "actioned";
    actor_id: string;
    actor_name: string | null;
    acted_at: string;
    note: string | null;
  }>
> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("insight_actions")
    .select("action_type, actor_id, acted_at, note, users!actor_id(name)")
    .eq("insight_key", insight_key)
    .order("acted_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  type Row = {
    action_type: "ignored" | "actioned";
    actor_id: string;
    acted_at: string;
    note: string | null;
    users: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      action_type: r.action_type,
      actor_id: r.actor_id,
      actor_name: u?.name ?? null,
      acted_at: r.acted_at,
      note: r.note
    };
  });
}
