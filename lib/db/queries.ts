import { getServerClient } from "@/lib/supabase/server";
import { deleteFile } from "@/lib/storage";
import { isAdminEmail } from "@/lib/auth/admin-check";

export type MockUserListItem = {
  id: string;
  name: string;
  email: string;
  department_name: string | null;
  is_admin: boolean;
};

// 列出 seed 用户(/auth/dev 切换页用,按部门 + 姓名排序)
export async function listMockUsers(): Promise<MockUserListItem[]> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, departments(name)")
    .order("name");

  if (error) throw error;

  // Supabase TS 把关联查询推断为数组,运行时实际是对象或数组,统一处理
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    name: string;
    email: string;
    departments: { name: string } | { name: string }[] | null;
  }>;

  return rows.map(r => {
    const dept = Array.isArray(r.departments) ? r.departments[0] : r.departments;
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      department_name: dept?.name ?? null,
      is_admin: isAdminEmail(r.email)
    };
  });
}

export async function userExists(userId: string): Promise<boolean> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/** 仅按 id 取用户姓名 — 给 admin 跳转预填 chip 显示用 */
export async function getUserNameById(userId: string): Promise<string | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { name: string }).name;
}

export type DeptQuotaMonth = {
  month: string;          // "YYYY-MM"
  credits_used: number;
  credits_limit: number;
  usage_ratio: number;
};

/** 近 N 月部门配额使用率历史 — AI 洞察 quota-fit 和 DeptDetailPanel "6 月历史" 共用 */
export async function getDeptQuotaHistory(
  deptId: string,
  months = 6
): Promise<DeptQuotaMonth[]> {
  const supabase = getServerClient();
  const now = new Date();
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)
  );
  const startIso = startDate.toISOString();

  // 一次拿回该部门近 N 月的 quotas + tasks，分别聚合
  const [{ data: quotaRows }, { data: taskRows }] = await Promise.all([
    supabase
      .from("quotas")
      .select("month, credits_limit")
      .eq("department_id", deptId)
      .gte("month", startDate.toISOString().slice(0, 10)),
    supabase
      .from("generation_tasks")
      .select("created_at, credits_cost")
      .eq("department_id", deptId)
      .eq("status", "succeeded")
      .gte("created_at", startIso)
  ]);

  // 配额按 YYYY-MM 索引
  const limitMap = new Map<string, number>();
  for (const q of (quotaRows ?? []) as Array<{ month: string; credits_limit: number }>) {
    limitMap.set(q.month.slice(0, 7), q.credits_limit);
  }
  // 用量按 YYYY-MM 聚合
  const usedMap = new Map<string, number>();
  for (const t of (taskRows ?? []) as Array<{ created_at: string; credits_cost: number | string | null }>) {
    const monthKey = t.created_at.slice(0, 7);
    usedMap.set(monthKey, (usedMap.get(monthKey) ?? 0) + (Number(t.credits_cost) || 0));
  }

  // 输出近 N 个月，月份缺失也补 0
  const out: DeptQuotaMonth[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + i, 1)
    );
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const limit = limitMap.get(key) ?? 0;
    const used = usedMap.get(key) ?? 0;
    out.push({
      month: key,
      credits_used: Math.round(used),
      credits_limit: limit,
      usage_ratio: limit > 0 ? used / limit : 0
    });
  }
  return out;
}

// 写 audit_logs 一条记录(技术 5.5)
export async function writeAuditLog(args: {
  user_id: string | null;
  action: string;
  target_type?: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
}): Promise<void> {
  const supabase = getServerClient();
  const { error } = await supabase.from("audit_logs").insert({
    user_id: args.user_id,
    action: args.action,
    target_type: args.target_type ?? null,
    target_id: args.target_id ?? null,
    metadata: args.metadata ?? null,
    ip_address: args.ip_address ?? null
  });
  if (error) {
    // audit_logs 失败不阻塞业务,只记 stderr
    // eslint-disable-next-line no-console
    console.error("[audit_logs] write failed:", error.message);
  }
}

// 更新 last_login_at(mock + real 切换时都用)
export async function touchLastLogin(userId: string): Promise<void> {
  const supabase = getServerClient();
  await supabase
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
}

// ─── 模型 / 标签 / 配额 ─────────────────────────────────────────────────────

export type ModelRow = {
  id: string;
  name: string;
  provider: string;
  type: "image" | "video";
  easyrouter_model_key: string;
  is_baseline: boolean;
  credits_per_unit: number;
  enabled: boolean;
  // V1.11 加的两个字段(可空,前端 fallback)
  preview_url: string | null;
  description: string | null;
};

const MODEL_SELECT = "id, name, provider, type, easyrouter_model_key, is_baseline, credits_per_unit, enabled, preview_url, description";

export async function listEnabledModels(type: "image" | "video"): Promise<ModelRow[]> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("models")
    .select(MODEL_SELECT)
    .eq("type", type)
    .eq("enabled", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ModelRow[];
}

export async function getModelById(modelId: string): Promise<ModelRow | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("models")
    .select(MODEL_SELECT)
    .eq("id", modelId)
    .maybeSingle();
  if (error) return null;
  return data as ModelRow | null;
}

export type PurposeTagRow = {
  id: string;
  name: string;
  name_normalized: string; // 025 · M5 P1 波 3:前端判断"其他"id 用('other_v2'),避开按 name 字面匹配
  is_default: boolean;
  is_user_created?: boolean;
  created_by_user_id?: string | null;
};

export async function listActivePurposeTags(): Promise<PurposeTagRow[]> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("purpose_tags")
    .select("id, name, name_normalized, is_default, is_user_created")
    .is("merged_into_id", null)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as PurposeTagRow[];
}

// 024 · M5 P1 波 2:校验 tagId 是否是 active(merged_into_id IS NULL)
// 给 setConversationPrimaryTag + API 层用,确保只有 5 新预设(或员工自定义 active tag)能成为主标签
export async function isActivePurposeTag(id: string): Promise<boolean> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("purpose_tags")
    .select("id")
    .eq("id", id)
    .is("merged_into_id", null)
    .maybeSingle();
  return data !== null;
}

// V1.12 员工新增 tag(去重 name_normalized;Q-V1-10 不审核直接生效)
// name_normalized = lower trim;若已有同名活跃 tag → 抛 DuplicateTagError;否则插入
export class DuplicateTagError extends Error {
  constructor(public existingName: string) {
    super(`tag "${existingName}" 已存在`);
    this.name = "DuplicateTagError";
  }
}

export async function createUserPurposeTag(args: {
  name: string;
  user_id: string;
}): Promise<PurposeTagRow> {
  const normalized = args.name.trim().toLowerCase();
  if (!normalized) throw new Error("name 不能为空");
  if (normalized.length > 32) throw new Error("name 不能超过 32 字符");

  const supabase = getServerClient();
  // 先查重(只看 active);走部分唯一索引 uniq_active_tag 兜底
  const { data: existing } = await supabase
    .from("purpose_tags")
    .select("id, name")
    .eq("name_normalized", normalized)
    .is("merged_into_id", null)
    .maybeSingle();
  if (existing) {
    throw new DuplicateTagError((existing as { name: string }).name);
  }

  // 取当前 max sort_order + 1
  const { data: maxRow } = await supabase
    .from("purpose_tags")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("purpose_tags")
    .insert({
      name: args.name.trim(),
      name_normalized: normalized,
      is_default: false,
      is_user_created: true,
      created_by_user_id: args.user_id,
      sort_order: nextSort
    })
    .select("id, name, name_normalized, is_default, is_user_created, created_by_user_id")
    .single();
  if (error) {
    // 23505 = 部分唯一索引并发撞,转 DuplicateTagError
    if ((error as { code?: string }).code === "23505") {
      throw new DuplicateTagError(args.name.trim());
    }
    throw error;
  }
  return data as PurposeTagRow;
}

// V1.12 admin 看到所有 tag(含 merged 已合并的,给历史展示;但合并工具只让选 active)
export type AdminPurposeTagRow = PurposeTagRow & {
  // name_normalized 已升至 PurposeTagRow(025 · M5 P1 波 3),此处不重复
  merged_into_id: string | null;
  merged_into_name: string | null;
  task_count: number;
  created_at: string;
};

export async function listAllPurposeTagsForAdmin(): Promise<AdminPurposeTagRow[]> {
  const supabase = getServerClient();
  const { data: tags } = await supabase
    .from("purpose_tags")
    .select("id, name, name_normalized, is_default, is_user_created, created_by_user_id, merged_into_id, created_at")
    .order("is_user_created", { ascending: true })
    .order("sort_order", { ascending: true });

  type Raw = {
    id: string;
    name: string;
    name_normalized: string;
    is_default: boolean;
    is_user_created: boolean;
    created_by_user_id: string | null;
    merged_into_id: string | null;
    created_at: string;
  };
  const rows = (tags ?? []) as Raw[];

  // 取每个 tag 的 generation_tasks 计数(按 name 快照查 — 决策 3.2 快照存储)
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: countsRaw } = await supabase
      .from("generation_tasks")
      .select("purpose_tag_name");
    // client-side group(简化;V2 改 RPC view)
    for (const r of (countsRaw ?? []) as Array<{ purpose_tag_name: string | null }>) {
      if (!r.purpose_tag_name) continue;
      counts.set(r.purpose_tag_name, (counts.get(r.purpose_tag_name) ?? 0) + 1);
    }
  }

  const idToName = new Map<string, string>(rows.map(r => [r.id, r.name]));

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    name_normalized: r.name_normalized,
    is_default: r.is_default,
    is_user_created: r.is_user_created,
    created_by_user_id: r.created_by_user_id,
    merged_into_id: r.merged_into_id,
    merged_into_name: r.merged_into_id ? (idToName.get(r.merged_into_id) ?? null) : null,
    task_count: counts.get(r.name) ?? 0,
    created_at: r.created_at
  }));
}

// V1.12 admin 合并 tag:source → target
// 行为:source.merged_into_id = target.id;source 在 active 列表消失
// 历史 generation_tasks.purpose_tag_name 保留快照不变(决策 3.2)
export class TagNotFoundError extends Error {
  constructor() { super("tag not found"); this.name = "TagNotFoundError"; }
}
export class TagAlreadyMergedError extends Error {
  constructor() { super("tag already merged"); this.name = "TagAlreadyMergedError"; }
}
export class CannotMergeIntoSelfError extends Error {
  constructor() { super("cannot merge into self"); this.name = "CannotMergeIntoSelfError"; }
}
export class CannotMergeBuiltinTagError extends Error {
  constructor() { super("不能合并默认标签(is_default=true)"); this.name = "CannotMergeBuiltinTagError"; }
}

export async function mergePurposeTags(args: {
  source_id: string;
  target_id: string;
}): Promise<{ source_name: string; target_name: string; affected_tasks: number }> {
  if (args.source_id === args.target_id) throw new CannotMergeIntoSelfError();
  const supabase = getServerClient();

  const [s, t] = await Promise.all([
    supabase.from("purpose_tags").select("id, name, is_default, merged_into_id").eq("id", args.source_id).maybeSingle(),
    supabase.from("purpose_tags").select("id, name, merged_into_id").eq("id", args.target_id).maybeSingle()
  ]);
  const source = s.data as { id: string; name: string; is_default: boolean; merged_into_id: string | null } | null;
  const target = t.data as { id: string; name: string; merged_into_id: string | null } | null;
  if (!source || !target) throw new TagNotFoundError();
  if (source.merged_into_id) throw new TagAlreadyMergedError();
  if (source.is_default) throw new CannotMergeBuiltinTagError();
  if (target.merged_into_id) throw new TagAlreadyMergedError();

  // 1. 更新 source.merged_into_id = target.id
  const { error: e1 } = await supabase
    .from("purpose_tags")
    .update({ merged_into_id: args.target_id })
    .eq("id", args.source_id);
  if (e1) throw e1;

  // 2. 数据上不批改 generation_tasks.purpose_tag_name(快照决策 3.2)
  //    但为给 admin 看到合并影响,返个引用 count(本月内,简化)
  const { count: affected } = await supabase
    .from("generation_tasks")
    .select("id", { count: "exact", head: true })
    .eq("purpose_tag_name", source.name);

  return {
    source_name: source.name,
    target_name: target.name,
    affected_tasks: affected ?? 0
  };
}

export async function getDefaultPurposeTag(): Promise<PurposeTagRow | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("purpose_tags")
    .select("id, name, name_normalized, is_default")
    .eq("is_default", true)
    .is("merged_into_id", null)
    .maybeSingle();
  if (error) return null;
  return data as PurposeTagRow | null;
}

// ─── 部门配额校验(技术 5.3)──────────────────────────────────────────────
// 返回当月部门已用积分 / 上限 / 警告等级

export type QuotaSnapshot = {
  used_credits: number;
  limit_credits: number;
  ratio: number;
  warning: "green" | "yellow" | "red";
};

export async function getDepartmentQuotaSnapshot(departmentId: string): Promise<QuotaSnapshot> {
  const supabase = getServerClient();
  const monthStart = firstOfMonthIso();

  const [usedRes, quotaRes] = await Promise.all([
    supabase
      .from("generation_tasks")
      .select("credits_cost")
      .eq("department_id", departmentId)
      .eq("status", "succeeded")
      .gte("created_at", monthStart),
    supabase
      .from("quotas")
      .select("credits_limit")
      .eq("department_id", departmentId)
      .eq("month", monthStart.slice(0, 10))
      .maybeSingle()
  ]);

  const used =
    (usedRes.data ?? []).reduce((s, r) => s + (Number(r.credits_cost) || 0), 0);
  const limit = quotaRes.data?.credits_limit ?? 5000;
  const ratio = limit > 0 ? used / limit : 0;
  const warning = ratio >= 1 ? "red" : ratio >= 0.8 ? "yellow" : "green";

  return { used_credits: used, limit_credits: limit, ratio, warning };
}

function firstOfMonthIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** 把 "YYYY-MM"（或省略=本月）转成 [from, nextMonthStart) 时间区间的 ISO 字符串 */
function monthRangeIso(month?: string): { from: string; to: string } {
  let year: number;
  let monthIdx: number; // 0-11
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    year = Number(month.slice(0, 4));
    monthIdx = Number(month.slice(5, 7)) - 1;
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    monthIdx = now.getUTCMonth();
  }
  const from = new Date(Date.UTC(year, monthIdx, 1)).toISOString();
  const to = new Date(Date.UTC(year, monthIdx + 1, 1)).toISOString();
  return { from, to };
}

// ─── generation_tasks / generation_results 写入 ─────────────────────────

export type TaskSnapshot = {
  user_id: string;
  department_id: string | null;
  department_name: string | null;
  type: "image" | "video";
  model_id: string;
  model_name: string; // snapshot
  prompt: string;
  ratio: string;
  duration_seconds: number | null;
  purpose_tag_id: string;
  purpose_tag_name: string; // snapshot
  reference_image_url: string | null;
  conversation_id?: string | null; // 2026-05-29 V1 加 B:必填(generate route 兜底 ensureDefaultConversation)
};

export class ActiveTaskExistsError extends Error {
  constructor() {
    super("user already has an active task");
    this.name = "ActiveTaskExistsError";
  }
}

export async function createTask(t: TaskSnapshot): Promise<string> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("generation_tasks")
    .insert({
      ...t,
      status: "queued"
    })
    .select("id")
    .single();
  if (error) {
    // Postgres unique_violation = 23505。我们的 uniq_user_active_task 部分唯一索引
    // 在 status IN (queued|running) 时强制每 user 只能 1 条
    if ((error as { code?: string }).code === "23505") {
      throw new ActiveTaskExistsError();
    }
    throw error;
  }
  if (!data) throw new Error("createTask: no row returned");
  return data.id;
}

export async function markTaskRunning(taskId: string): Promise<void> {
  const supabase = getServerClient();
  await supabase.from("generation_tasks").update({ status: "running" }).eq("id", taskId);
}

export async function markTaskSucceeded(
  taskId: string,
  args: { cost_cny: number | null; credits_cost: number | null; easyrouter_task_id?: string }
): Promise<void> {
  const supabase = getServerClient();
  await supabase
    .from("generation_tasks")
    .update({
      status: "succeeded",
      cost_cny: args.cost_cny,
      credits_cost: args.credits_cost,
      easyrouter_task_id: args.easyrouter_task_id ?? null,
      completed_at: new Date().toISOString()
    })
    .eq("id", taskId);
}

export async function markTaskFailed(taskId: string, errorMessage: string): Promise<void> {
  const supabase = getServerClient();
  await supabase
    .from("generation_tasks")
    .update({
      status: "failed",
      error_message: errorMessage.slice(0, 500),
      completed_at: new Date().toISOString()
    })
    .eq("id", taskId);
}

export type ResultRow = {
  task_id: string;
  file_path: string;
  file_type: string;
  file_size?: number;
  width?: number;
  height?: number;
  duration_seconds?: number;
  output_index?: number; // V1.10:多张出图时 0..N-1;默认 0 兼容老代码
};

export async function createResult(r: ResultRow): Promise<void> {
  const supabase = getServerClient();
  const { error } = await supabase.from("generation_results").insert(r);
  if (error) throw error;
}

// V1.10 批量插 N 行结果(多张出图)
export async function createResults(rows: ResultRow[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getServerClient();
  const { error } = await supabase.from("generation_results").insert(rows);
  if (error) throw error;
}

// V1.10 取某 task 的所有 output(按 output_index 升序)
export type OutputRow = {
  file_path: string;
  file_type: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  output_index: number;
  created_at: string;
};

export async function listTaskOutputs(taskId: string): Promise<OutputRow[]> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("generation_results")
    .select("file_path, file_type, file_size, width, height, duration_seconds, output_index, created_at")
    .eq("task_id", taskId)
    .order("output_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OutputRow[];
}

// 批量取多个任务的首张产物 file_path(Prompt 收藏卡缩略图用)
// 返回 task_id → { file_path, file_type };一个 task 取 output_index 最小的一条
export async function getFirstOutputForTasks(
  taskIds: string[]
): Promise<Map<string, { file_path: string; file_type: string }>> {
  const result = new Map<string, { file_path: string; file_type: string }>();
  if (taskIds.length === 0) return result;
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("generation_results")
    .select("task_id, file_path, file_type, output_index")
    .in("task_id", taskIds)
    .order("output_index", { ascending: true });
  if (error) throw error;
  for (const r of (data ?? []) as Array<{
    task_id: string;
    file_path: string;
    file_type: string;
  }>) {
    // order 已按 output_index 升序,首次出现即最小下标
    if (!result.has(r.task_id)) {
      result.set(r.task_id, { file_path: r.file_path, file_type: r.file_type });
    }
  }
  return result;
}

// ─── 批量删除任务(资产页批量操作,2026-05-22)──────────────────────────────
// 删除粒度 = 任务(连同全部产物);删产物文件 + 解绑收藏 + 删任务行
// generation_results 经 FK ON DELETE CASCADE 随任务一并删
export async function deleteTasksForUser(args: {
  user_id: string;
  is_admin: boolean;
  task_ids: string[];
}): Promise<{ deleted: number }> {
  if (args.task_ids.length === 0) return { deleted: 0 };
  const supabase = getServerClient();

  // 1. 校验任务存在 + 归属(非 admin 只能删自己的)
  const { data: tasks } = await supabase
    .from("generation_tasks")
    .select("id, user_id")
    .in("id", args.task_ids);
  const ownedIds = ((tasks ?? []) as Array<{ id: string; user_id: string }>)
    .filter(t => args.is_admin || t.user_id === args.user_id)
    .map(t => t.id);
  if (ownedIds.length === 0) return { deleted: 0 };

  // 2. 删产物文件(best-effort,文件可能已不存在)
  const { data: results } = await supabase
    .from("generation_results")
    .select("file_path")
    .in("task_id", ownedIds);
  for (const r of (results ?? []) as Array<{ file_path: string }>) {
    try {
      await deleteFile(r.file_path);
    } catch {
      /* 文件缺失忽略 */
    }
  }

  // 3. 删关联收藏(prompt_collections.task_id 无 ON DELETE,须先处理)
  await supabase.from("prompt_collections").delete().in("task_id", ownedIds);

  // 4. 删任务(generation_results 经 FK ON DELETE CASCADE 一并删)
  const { error } = await supabase.from("generation_tasks").delete().in("id", ownedIds);
  if (error) throw error;

  return { deleted: ownedIds.length };
}

// ─── 历史列表(Week 2 任务 2.1)─────────────────────────────────────────────

export type HistoryItem = {
  id: string;
  type: "image" | "video";
  status: string;
  prompt: string;
  ratio: string;
  duration_seconds: number | null;
  model_name: string;
  purpose_tag_name: string;
  credits_cost: number | null;
  created_at: string;
  result_file_path: string | null;
  result_file_type: string | null;
};

// 单个任务的产物(V1.10 多张出图:一个 task 可有 1/2/4 个 generation_results 行)
export type TaskOutputLite = {
  output_index: number;
  file_path: string;
  file_type: string;
  width: number | null;
  height: number | null;
};

// 历史行 + 全部产物(历史画廊按张展示需要每张图,不只主图)
export type HistoryItemWithOutputs = HistoryItem & { outputs: TaskOutputLite[] };

export type ListTasksFilters = {
  user_id: string;
  type?: "image" | "video";
  date_from?: string; // ISO
  date_to?: string;
  model_name?: string; // 精确匹配快照模型名
  purpose_tag_name?: string; // 精确匹配快照用途名
  q?: string; // Prompt 模糊搜索(ilike)
  collected?: boolean; // 仅看已收藏(资产页「我的收藏」筛选)
  page?: number;
  page_size?: number;
};

export async function listUserTasks(filters: ListTasksFilters): Promise<{
  rows: HistoryItemWithOutputs[];
  total: number;
  page: number;
  page_size: number;
}> {
  const supabase = getServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.page_size ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 资产/历史页只列 succeeded —— failed/cancelled/queued/running 不展示给用户,
  // 但 DB 行保留(审计日志 FK / 管理员 failed_count 统计 / 上游问题排查仍需要)
  let query = supabase
    .from("generation_tasks")
    .select(
      "id, type, status, prompt, ratio, duration_seconds, model_name, purpose_tag_name, credits_cost, created_at",
      { count: "exact" }
    )
    .eq("user_id", filters.user_id)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.date_from) query = query.gte("created_at", filters.date_from);
  if (filters.date_to) query = query.lte("created_at", filters.date_to);
  if (filters.model_name) query = query.eq("model_name", filters.model_name);
  if (filters.purpose_tag_name) query = query.eq("purpose_tag_name", filters.purpose_tag_name);
  if (filters.q) {
    // Prompt 模糊搜索;转义 ilike 通配符避免用户输入 % / _ 干扰
    const escaped = filters.q.replace(/[\\%_]/g, m => `\\${m}`);
    query = query.ilike("prompt", `%${escaped}%`);
  }
  if (filters.collected) {
    // 仅看已收藏:先取该用户收藏过的 task_id 列表再 .in() 过滤
    const { data: colls } = await supabase
      .from("prompt_collections")
      .select("task_id")
      .eq("user_id", filters.user_id);
    const collectedIds = [
      ...new Set(
        ((colls ?? []) as Array<{ task_id: string | null }>)
          .map(c => c.task_id)
          .filter((id): id is string => id != null)
      )
    ];
    if (collectedIds.length === 0) {
      return { rows: [], total: 0, page, page_size: pageSize };
    }
    query = query.in("id", collectedIds);
  }

  const { data: tasks, error, count } = await query;
  if (error) throw error;

  const taskIds = (tasks ?? []).map(t => t.id);
  // V1.10 多张出图:一个 task 可有多个 generation_results 行,按 output_index 升序取全部
  const outputsMap = new Map<string, TaskOutputLite[]>();
  if (taskIds.length > 0) {
    const { data: results } = await supabase
      .from("generation_results")
      .select("task_id, file_path, file_type, width, height, output_index")
      .in("task_id", taskIds)
      .order("output_index", { ascending: true });
    for (const r of results ?? []) {
      const arr = outputsMap.get(r.task_id) ?? [];
      arr.push({
        output_index: r.output_index ?? 0,
        file_path: r.file_path,
        file_type: r.file_type,
        width: r.width ?? null,
        height: r.height ?? null
      });
      outputsMap.set(r.task_id, arr);
    }
  }

  const rows: HistoryItemWithOutputs[] = (tasks ?? []).map(t => {
    const outputs = outputsMap.get(t.id) ?? [];
    return {
      id: t.id,
      type: t.type as "image" | "video",
      status: t.status,
      prompt: t.prompt,
      ratio: t.ratio,
      duration_seconds: t.duration_seconds,
      model_name: t.model_name,
      purpose_tag_name: t.purpose_tag_name,
      credits_cost: t.credits_cost,
      created_at: t.created_at,
      result_file_path: outputs[0]?.file_path ?? null,
      result_file_type: outputs[0]?.file_type ?? null,
      outputs
    };
  });

  return { rows, total: count ?? 0, page, page_size: pageSize };
}

// 单条 task 详情(重新生成用,只读自己的)
export async function getUserTask(taskId: string, userId: string): Promise<HistoryItem | null> {
  const supabase = getServerClient();
  const { data: t } = await supabase
    .from("generation_tasks")
    .select("id, user_id, type, status, prompt, ratio, duration_seconds, model_id, model_name, purpose_tag_id, purpose_tag_name, credits_cost, created_at")
    .eq("id", taskId)
    .maybeSingle();
  if (!t || (t as { user_id: string }).user_id !== userId) return null;
  const { data: r } = await supabase
    .from("generation_results")
    .select("file_path, file_type")
    .eq("task_id", taskId)
    .limit(1)
    .maybeSingle();
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    prompt: t.prompt,
    ratio: t.ratio,
    duration_seconds: t.duration_seconds,
    model_name: t.model_name,
    purpose_tag_name: t.purpose_tag_name,
    credits_cost: t.credits_cost,
    created_at: t.created_at,
    result_file_path: r?.file_path ?? null,
    result_file_type: r?.file_type ?? null
  };
}

// ─── 历史记录页:统计条 + 筛选下拉数据源 ─────────────────────────────────

export type HistoryStats = {
  total_count: number; // 累计生成(全部状态)
  month_count: number; // 本月生成
  image_count: number; // 图片累计
  video_count: number; // 视频累计
};

// 历史页顶部单行统计条(D5 反悔后历史页自带轻量 stat,深度看板归 /profile 个人用量)
export async function getHistoryStats(userId: string): Promise<HistoryStats> {
  const supabase = getServerClient();
  const monthStart = firstOfMonthIso();
  const base = () =>
    supabase
      .from("generation_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

  const [total, month, image, video] = await Promise.all([
    base(),
    base().gte("created_at", monthStart),
    base().eq("type", "image"),
    base().eq("type", "video")
  ]);

  return {
    total_count: total.count ?? 0,
    month_count: month.count ?? 0,
    image_count: image.count ?? 0,
    video_count: video.count ?? 0
  };
}

// 历史页筛选下拉的"模型 / 用途"选项:取当前用户实际用过的快照值去重
// 用 task 快照而非 models / purpose_tags 表 — 下线的模型 / 合并的标签历史里仍要能筛
export async function getUserTaskFilterOptions(
  userId: string
): Promise<{ models: string[]; purposes: string[] }> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("generation_tasks")
    .select("model_name, purpose_tag_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(2000);

  const models = new Set<string>();
  const purposes = new Set<string>();
  for (const r of (data ?? []) as Array<{ model_name: string | null; purpose_tag_name: string | null }>) {
    if (r.model_name) models.add(r.model_name);
    if (r.purpose_tag_name) purposes.add(r.purpose_tag_name);
  }
  return {
    models: [...models].sort((a, b) => a.localeCompare(b, "zh")),
    purposes: [...purposes].sort((a, b) => a.localeCompare(b, "zh"))
  };
}

// ─── 个人用量(任务 2.2 简版,本月已用 + baseline 换算)─────────────────

export type PersonalUsage = {
  used_credits_month: number;
  limit_credits: number;
  remaining_credits: number;
  images_baseline_per_unit: number; // baseline image model 单价
  videos_baseline_per_unit: number; // baseline video model 单价
  warning: "green" | "yellow" | "red";
};

export async function getPersonalUsage(args: {
  user_id: string;
  department_id: string | null;
}): Promise<PersonalUsage> {
  const supabase = getServerClient();
  const monthStart = firstOfMonthIso();

  // 部门累计已用(决策 5:配额是部门级)
  const deptId = args.department_id;
  const [usedRes, quotaRes, baselineRes] = await Promise.all([
    deptId
      ? supabase
          .from("generation_tasks")
          .select("credits_cost")
          .eq("department_id", deptId)
          .eq("status", "succeeded")
          .gte("created_at", monthStart)
      : Promise.resolve({ data: [] }),
    deptId
      ? supabase
          .from("quotas")
          .select("credits_limit")
          .eq("department_id", deptId)
          .eq("month", monthStart.slice(0, 10))
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("models")
      .select("type, credits_per_unit, is_baseline")
      .eq("is_baseline", true)
      .eq("enabled", true)
  ]);

  const used =
    ((usedRes.data ?? []) as Array<{ credits_cost: number | string | null }>).reduce(
      (s, r) => s + (Number(r.credits_cost) || 0),
      0
    );
  const limit = (quotaRes.data as { credits_limit?: number } | null)?.credits_limit ?? 5000;
  const remaining = Math.max(0, limit - used);

  const baseline = (baselineRes.data ?? []) as Array<{ type: string; credits_per_unit: number }>;
  const imgUnit = baseline.find(b => b.type === "image")?.credits_per_unit ?? 30;
  const vidUnit = baseline.find(b => b.type === "video")?.credits_per_unit ?? 100;

  const ratio = limit > 0 ? used / limit : 0;
  const warning = ratio >= 1 ? "red" : ratio >= 0.8 ? "yellow" : "green";

  return {
    used_credits_month: used,
    limit_credits: limit,
    remaining_credits: remaining,
    images_baseline_per_unit: imgUnit,
    videos_baseline_per_unit: vidUnit,
    warning
  };
}

// ─── 并发限制(技术 5.4)─────────────────────────────────────────────────
// 单用户同时只能 1 个 queued|running 的 task

export async function countActiveTasks(userId: string): Promise<number> {
  const supabase = getServerClient();
  const { count } = await supabase
    .from("generation_tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "running"]);
  return count ?? 0;
}

// Day 45 续³ 兜底:卡死任务自动清理 + 重数活跃
//
// 背景:V1 没有定时任务,卡住的 queued/running 任务(进程崩 / poll 中断 / 上游超时)
//   会永久占着「单用户单活跃任务」的锁,后续生成被「上一个还在生成」拦住,
//   只能跑 scripts/cancel-stuck-tasks.ts 手动清理。
//
// 策略:每次提交新任务前调本函数 ——
//   1. 拉取用户的 queued/running 任务及 created_at
//   2. 按类型阈值(image 5min / video 20min)判断"明显卡死"
//   3. 卡死的就地 update 为 failed + 写明原因,放行新任务
//   4. 返回"真正还活着"的活跃任务数
//
// 阈值依据:image 走 chat completions 同步出图,正常 11–60s,>2min 即视为卡死;
//   video 走异步轮询(create→poll→download),正常 36–180s,>5min 即视为卡死。
// 2026-05-25 收紧:嘉斌反馈 5/20min 过宽 → 改 2/5min,更快放行新任务。
const IMAGE_STALE_MS = 2 * 60_000;
const VIDEO_STALE_MS = 5 * 60_000;

export async function cleanupStaleAndCountActive(userId: string): Promise<number> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("generation_tasks")
    .select("id, type, created_at")
    .eq("user_id", userId)
    .in("status", ["queued", "running"]);

  const rows = (data ?? []) as Array<{ id: string; type: string; created_at: string }>;
  if (rows.length === 0) return 0;

  const now = Date.now();
  let alive = 0;
  for (const r of rows) {
    const ageMs = now - new Date(r.created_at).getTime();
    const threshold = r.type === "video" ? VIDEO_STALE_MS : IMAGE_STALE_MS;
    if (ageMs > threshold) {
      const ageMin = Math.round(ageMs / 60_000);
      const { error } = await supabase
        .from("generation_tasks")
        .update({
          status: "failed",
          error_message: `自动清理:${r.type} 任务卡死 ${ageMin}min(超过 ${threshold / 60_000}min 阈值)`,
          completed_at: new Date().toISOString()
        })
        .eq("id", r.id)
        .in("status", ["queued", "running"]); // 二次校验避免覆盖恰好刚成功的行
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[cleanupStaleAndCountActive] update failed:", error.message);
        alive++; // 清理失败时保守计为活跃,避免误放并发
      }
    } else {
      alive++;
    }
  }
  return alive;
}

// ─── V1 个人中心:Profile Header 终身统计 ────────────────────────────────────
// 2026-05-25 Day 44(重塑规格 §3.2):Header 精简为"关于我"——身份信息 + 1 个终身统计
// 「累计生成 X 次」。月度数据下方核心区已完整呈现,Header 不再重复。
// 原 mini-stat「本月已用 312/5,000」下沉到用量核心区额度主卡;「Prompt 收藏 26 条」
// 因收藏模块已迁出(Day 41),Header 不再展示。

export type ProfileHeaderStats = {
  total_succeeded_count: number;
};

export async function getProfileHeaderStats(args: {
  user_id: string;
}): Promise<ProfileHeaderStats> {
  const supabase = getServerClient();
  const { count } = await supabase
    .from("generation_tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.user_id)
    .eq("status", "succeeded");
  return { total_succeeded_count: count ?? 0 };
}

// ─── V1 个人中心:用量 dashboard(2026-05-25 Day 44 重塑规格 §3.3-§3.5)─────
// 用量核心区 = 个人额度主卡(决策 5 修订:加入个人级,仍是软提示)+ 图片/视频产出卡
// 部门负责人额外并列「部门额度概览卡」(`dept_overview` 字段,普通员工 / admin 为 null)
// + 近 14 天双色柱状图 + 按使用目的 / 常用模型拆分
//
// 删除:原「累计生成耗时」卡(对员工无行动价值);原 `total_seconds / avg_seconds /
// month_progress_pct` 字段不再下发。

export type UsageDashboardData = {
  // 额度主卡:个人月配额(默认 5000,可按人调,跟 users.monthly_quota_credits 一致)
  personal_credits_used: number;
  personal_credits_limit: number;
  personal_credits_remaining: number;
  personal_pct_used: number; // 0–100+(允许超额展示)
  reset_label: string; // "5 月 31 日"
  // 产出卡:图片
  image_count: number;
  image_share_pct: number; // 图片占本月总次数比例
  image_mom_pct: number | null; // 环比上月,null = 上月无数据
  // 产出卡:视频
  video_count: number;
  video_share_pct: number;
  video_mom_pct: number | null;
  total_count: number; // 本月生成总次数(图片 + 视频)
  // 近 14 天柱状图(个人维度)
  daily: Array<{ label: string; image: number; video: number }>;
  daily_max: number;
  // 拆分
  purposes: Array<{ name: string; count: number }>; // 按使用目的 top 5
  models: Array<{ name: string; count: number }>; // 常用模型 top 4
  // 部门概览(仅 manager,普通员工 / admin = null)
  dept_overview: {
    credits_used: number;
    credits_limit: number;
    credits_remaining: number;
    pct_used: number;
    member_count: number;
  } | null;
};

export async function getPersonalUsageDashboard(args: {
  user_id: string;
  department_id: string | null;
  personal_quota_credits: number;
  include_dept_overview: boolean;
}): Promise<UsageDashboardData> {
  const supabase = getServerClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const daysInMonth = monthEnd.getUTCDate();
  const window14Start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13));

  type TaskRow = {
    type: string;
    credits_cost: number | string | null;
    created_at: string;
    model_name: string;
    purpose_tag_name: string;
  };

  const deptId = args.department_id;
  const wantDept = args.include_dept_overview && deptId != null;

  const [monthRes, lastMonthRes, win14Res, deptUsedRes, quotaRes, memberRes] = await Promise.all([
    supabase
      .from("generation_tasks")
      .select("type, credits_cost, created_at, model_name, purpose_tag_name")
      .eq("user_id", args.user_id)
      .eq("status", "succeeded")
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("generation_tasks")
      .select("type")
      .eq("user_id", args.user_id)
      .eq("status", "succeeded")
      .gte("created_at", lastMonthStart.toISOString())
      .lt("created_at", monthStart.toISOString()),
    supabase
      .from("generation_tasks")
      .select("type, created_at")
      .eq("user_id", args.user_id)
      .eq("status", "succeeded")
      .gte("created_at", window14Start.toISOString()),
    wantDept
      ? supabase
          .from("generation_tasks")
          .select("credits_cost")
          .eq("department_id", deptId)
          .eq("status", "succeeded")
          .gte("created_at", monthStart.toISOString())
      : Promise.resolve({ data: [] as Array<{ credits_cost: number | string | null }> }),
    wantDept
      ? supabase
          .from("quotas")
          .select("credits_limit")
          .eq("department_id", deptId)
          .eq("month", monthStart.toISOString().slice(0, 10))
          .maybeSingle()
      : Promise.resolve({ data: null as { credits_limit?: number } | null }),
    wantDept
      ? supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("department_id", deptId)
      : Promise.resolve({ count: 0 })
  ]);

  const monthTasks = (monthRes.data ?? []) as TaskRow[];
  const lastMonthTasks = (lastMonthRes.data ?? []) as Array<{ type: string }>;

  // 额度主卡:个人月配额 + 本月已用(按 user_id 聚合 credits_cost)
  const personalUsed = monthTasks.reduce((s, t) => s + (Number(t.credits_cost) || 0), 0);
  const personalLimit = args.personal_quota_credits;
  const personalRemaining = Math.max(0, personalLimit - personalUsed);
  const personalPct = personalLimit > 0 ? Math.round((personalUsed / personalLimit) * 100) : 0;

  // 产出卡:图片 / 视频次数 + 环比
  const imageCount = monthTasks.filter(t => t.type === "image").length;
  const videoCount = monthTasks.filter(t => t.type === "video").length;
  const totalCount = imageCount + videoCount;
  const lastImage = lastMonthTasks.filter(t => t.type === "image").length;
  const lastVideo = lastMonthTasks.filter(t => t.type === "video").length;
  const momPct = (cur: number, prev: number): number | null =>
    prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);

  // 近 14 天逐日桶
  const dayKeys: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(window14Start.getTime() + i * 86400_000);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const dayBucket = new Map<string, { image: number; video: number }>();
  for (const k of dayKeys) dayBucket.set(k, { image: 0, video: 0 });
  for (const t of (win14Res.data ?? []) as Array<{ type: string; created_at: string }>) {
    const k = t.created_at.slice(0, 10);
    const b = dayBucket.get(k);
    if (b) {
      if (t.type === "video") b.video += 1;
      else b.image += 1;
    }
  }
  const daily = dayKeys.map(k => {
    const b = dayBucket.get(k)!;
    const [, m, d] = k.split("-");
    return { label: `${Number(m)}/${d}`, image: b.image, video: b.video };
  });
  const peak = Math.max(1, ...daily.map(d => Math.max(d.image, d.video)));
  // 取 4 的倍数,保证 5 条网格线(0 / ¼ / ½ / ¾ / 满)刻度都是整数
  const dailyMax = Math.max(8, Math.ceil(peak / 4) * 4);

  // 拆分:按使用目的(top 5)+ 常用模型(top 4)
  const purposeMap = new Map<string, number>();
  const modelMap = new Map<string, number>();
  for (const t of monthTasks) {
    purposeMap.set(t.purpose_tag_name, (purposeMap.get(t.purpose_tag_name) ?? 0) + 1);
    modelMap.set(t.model_name, (modelMap.get(t.model_name) ?? 0) + 1);
  }
  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  // 部门概览(仅 manager 装配)
  let deptOverview: UsageDashboardData["dept_overview"] = null;
  if (wantDept) {
    const deptUsed = (
      (deptUsedRes.data ?? []) as Array<{ credits_cost: number | string | null }>
    ).reduce((s, r) => s + (Number(r.credits_cost) || 0), 0);
    const deptLimit = (quotaRes.data as { credits_limit?: number } | null)?.credits_limit ?? 5000;
    deptOverview = {
      credits_used: Math.round(deptUsed),
      credits_limit: deptLimit,
      credits_remaining: Math.max(0, deptLimit - deptUsed),
      pct_used: deptLimit > 0 ? Math.round((deptUsed / deptLimit) * 100) : 0,
      member_count: (memberRes as { count?: number | null }).count ?? 0
    };
  }

  return {
    personal_credits_used: Math.round(personalUsed),
    personal_credits_limit: personalLimit,
    personal_credits_remaining: personalRemaining,
    personal_pct_used: personalPct,
    reset_label: `${monthEnd.getUTCMonth() + 1} 月 ${daysInMonth} 日`,
    image_count: imageCount,
    image_share_pct: totalCount > 0 ? Math.round((imageCount / totalCount) * 100) : 0,
    image_mom_pct: momPct(imageCount, lastImage),
    video_count: videoCount,
    video_share_pct: totalCount > 0 ? Math.round((videoCount / totalCount) * 100) : 0,
    video_mom_pct: momPct(videoCount, lastVideo),
    total_count: totalCount,
    daily,
    daily_max: dailyMax,
    purposes: sortDesc(purposeMap).slice(0, 5),
    models: sortDesc(modelMap).slice(0, 4),
    dept_overview: deptOverview
  };
}

// (2026-05-25 Day 44 删除:`getProfileQuotaDetail` / `ProfileQuotaDetail` —— 上一轮越界
//  实现的部门级深度看板,本次重塑按规格收窄到 `getPersonalUsageDashboard` 一处出数。)

// ─── 飞书每日报告数据(任务 3.6)─────────────────────────────────────────

export type DailyReportData = {
  date: string;
  total_generations: number;
  succeeded: number;
  failed: number;
  error_rate: number;
  total_credits: number;
  total_cny: number;
  top_departments: Array<{ name: string; count: number }>;
  top_models: Array<{ name: string; count: number }>;
};

export async function getDailyReportData(date: Date = new Date()): Promise<DailyReportData> {
  const supabase = getServerClient();
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
  const dayEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();

  const { data: tasks } = await supabase
    .from("generation_tasks")
    .select("status, department_name, model_name, credits_cost, cost_cny")
    .gte("created_at", dayStart)
    .lt("created_at", dayEnd);

  const rows = (tasks ?? []) as Array<{
    status: string;
    department_name: string | null;
    model_name: string;
    credits_cost: number | string | null;
    cost_cny: number | string | null;
  }>;

  const succeeded = rows.filter(r => r.status === "succeeded").length;
  const failed = rows.filter(r => r.status === "failed").length;
  const total = rows.length;
  const credits = rows.reduce((s, r) => s + (Number(r.credits_cost) || 0), 0);
  const cny = rows.reduce((s, r) => s + (Number(r.cost_cny) || 0), 0);

  const deptMap = new Map<string, number>();
  const modelMap = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "succeeded") continue;
    if (r.department_name) deptMap.set(r.department_name, (deptMap.get(r.department_name) ?? 0) + 1);
    modelMap.set(r.model_name, (modelMap.get(r.model_name) ?? 0) + 1);
  }

  const topByCount = (m: Map<string, number>, n = 5) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

  return {
    date: dayStart.slice(0, 10),
    total_generations: total,
    succeeded,
    failed,
    error_rate: total > 0 ? failed / total : 0,
    total_credits: credits,
    total_cny: Number(cny.toFixed(4)),
    top_departments: topByCount(deptMap, 5),
    top_models: topByCount(modelMap, 5)
  };
}

// ─── Admin 数据(Week 2 任务 2.3-2.5)────────────────────────────────────────
//
// 设计参考 4.3:KPI 4 卡 + 部门用量看板 + 模块分布 + 配额管理
// 时间筛选 MVP 只做"本月"/"近 30 天"(决策:不做近 7 天 / 本季度 / 本年)
// 跨部门数据:admin 看全部;非 admin 通过 requireAdmin 在 Route Handler 层拦住

// 2026-05-26: 扩展粒度系统支持「按日/按月/按季度/按年」二级时间筛选
// 旧 ranges (month/30d/7d/quarter/year) 保留向后兼容；新增 6m/12m/4q/2y
export type DateRange =
  | "month"
  | "30d"
  | "7d"
  | "quarter"
  | "year"
  | "6m"
  | "12m"
  | "4q"
  | "2y";

function dateRangeStart(range: DateRange): string {
  const now = new Date();
  if (range === "7d") return new Date(Date.now() - 7 * 86400_000).toISOString();
  if (range === "30d") return new Date(Date.now() - 30 * 86400_000).toISOString();
  if (range === "quarter") {
    // 近 90 天(简化,不严格按自然季度)
    return new Date(Date.now() - 90 * 86400_000).toISOString();
  }
  if (range === "year") {
    // 本年 1 月 1 日起
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  }
  if (range === "6m") {
    // 近 6 个完整月（含本月）：当前月起回退 5 个月的 1 号
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString();
  }
  if (range === "12m") {
    // 近 12 个完整月：当前月起回退 11 个月的 1 号
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString();
  }
  if (range === "4q") {
    // 近 4 个季度（约 12 个月）：当前月所在季度起回退 3 个季度
    const q = Math.floor(now.getUTCMonth() / 3);
    return new Date(Date.UTC(now.getUTCFullYear(), q * 3 - 9, 1)).toISOString();
  }
  if (range === "2y") {
    // 近 2 年：去年 1 月 1 日起
    return new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)).toISOString();
  }
  return firstOfMonthIso(); // "month"
}

type Granularity = "day" | "week" | "month" | "quarter" | "year";

// 时间粒度：
//   7d/30d → 按日
//   quarter / 6m / 12m / year → 按月（柱状汇总）
//   4q → 按季度（4 根柱）
//   2y → 按年（2 根柱）
//   month → 按月（用于非趋势的 KPI/聚合查询，保留向后兼容）
function rangeGranularity(range: DateRange): Granularity {
  if (range === "2y") return "year";
  if (range === "4q") return "quarter";
  if (
    range === "year" ||
    range === "quarter" ||
    range === "6m" ||
    range === "12m" ||
    range === "month"
  ) {
    return "month";
  }
  return "day";
}

// 归桶：日 YYYY-MM-DD / 周 YYYY-MM-DD(周一)/ 月 YYYY-MM / 季 YYYY-Qn / 年 YYYY
function bucketKey(iso: string, gran: Granularity): string {
  if (gran === "year") return iso.slice(0, 4); // YYYY
  if (gran === "quarter") {
    const d = new Date(iso);
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `${d.getUTCFullYear()}-Q${q}`; // YYYY-Q1
  }
  if (gran === "month") return iso.slice(0, 7); // YYYY-MM
  if (gran === "week") {
    const d = new Date(iso);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return d.toISOString().slice(0, 10);
  }
  return iso.slice(0, 10); // YYYY-MM-DD
}

function rangeBuckets(range: DateRange): string[] {
  const gran = rangeGranularity(range);
  const since = new Date(dateRangeStart(range));
  const now = new Date();
  const keys: string[] = [];
  if (gran === "day") {
    for (let d = new Date(since); d <= now; d.setUTCDate(d.getUTCDate() + 1)) {
      keys.push(d.toISOString().slice(0, 10));
    }
  } else if (gran === "week") {
    const start = new Date(since);
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
    for (let d = new Date(start); d <= now; d.setUTCDate(d.getUTCDate() + 7)) {
      keys.push(d.toISOString().slice(0, 10));
    }
  } else if (gran === "month") {
    // 从 since 月 1 号开始
    const start = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), 1));
    for (let d = new Date(start); d <= now; d.setUTCMonth(d.getUTCMonth() + 1)) {
      keys.push(d.toISOString().slice(0, 7));
    }
  } else if (gran === "quarter") {
    // 4 个季度
    const startQ = Math.floor(since.getUTCMonth() / 3);
    let y = since.getUTCFullYear();
    let q = startQ;
    while (true) {
      keys.push(`${y}-Q${q + 1}`);
      q++;
      if (q > 3) {
        q = 0;
        y++;
      }
      // stop when key crosses now
      const monthInQ = q * 3;
      const startOfNextQ = new Date(Date.UTC(y, monthInQ, 1));
      if (startOfNextQ > now) break;
    }
  } else {
    // year
    for (let y = since.getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
      keys.push(String(y));
    }
  }
  return keys;
}

// ─── KPI 4 卡 ─────────────────────────────────────────────────────────────
export type AdminKpi = {
  total_calls: number;
  total_credits: number;
  total_cny: number;
  active_departments: number;
  active_users: number;
  quota_warning_count: number; // 部门用量 ≥ 80% 的数
  // V1.6 Day 32:本月报销 + 总 AI 支出(平台 + 报销)
  // 只算 status='approved' 且 reviewed_at 在本月的报销
  total_reimbursement_cny: number;
  total_combined_cny: number; // total_cny + total_reimbursement_cny
  // Day 45 数据看板总览 KPI:环比上月(仅 range='month' 且无 deptId 时填)
  prev_total_calls: number | null;
  prev_combined_cny: number | null;
  // Day 45 续:KPI 概念分离 — ¥/积分分轨
  // total_credits_consumed = 本时间窗 succeeded tasks 的 credits_cost 求和
  total_credits_consumed: number;
  prev_total_credits_consumed: number | null;
  prev_total_reimbursement_cny: number | null;
  range: DateRange;
};

// V1.5 Day 30:加 optional deptId 让 manager dashboard 复用 — admin 不传 / manager 传 dept
// 行为变化:deptId 设时 active_departments 固定 1、quota_warning_count 仅看本部门
export async function getAdminKpi(
  range: DateRange = "month",
  deptId?: string
): Promise<AdminKpi> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);

  // 主体:本时间窗口内 succeeded tasks
  let tasksQuery = supabase
    .from("generation_tasks")
    .select("user_id, department_id, credits_cost, cost_cny")
    .eq("status", "succeeded")
    .gte("created_at", since);
  if (deptId) tasksQuery = tasksQuery.eq("department_id", deptId);
  const { data: tasks } = await tasksQuery;

  const rows = (tasks ?? []) as Array<{
    user_id: string;
    department_id: string | null;
    credits_cost: number | string | null;
    cost_cny: number | string | null;
  }>;

  const deptSet = new Set<string>();
  const userSet = new Set<string>();
  let credits = 0;
  let cny = 0;
  for (const r of rows) {
    if (r.department_id) deptSet.add(r.department_id);
    userSet.add(r.user_id);
    credits += Number(r.credits_cost) || 0;
    cny += Number(r.cost_cny) || 0;
  }

  // 配额预警:当月每个部门 used / limit ≥ 0.8 的数量
  // deptId 设时只看本部门
  const monthStart = firstOfMonthIso();
  let monthTasksQuery = supabase
    .from("generation_tasks")
    .select("department_id, credits_cost")
    .eq("status", "succeeded")
    .gte("created_at", monthStart);
  if (deptId) monthTasksQuery = monthTasksQuery.eq("department_id", deptId);
  let quotasQuery = supabase
    .from("quotas")
    .select("department_id, credits_limit")
    .eq("month", monthStart.slice(0, 10));
  if (deptId) quotasQuery = quotasQuery.eq("department_id", deptId);
  const [{ data: monthTasks }, { data: quotas }] = await Promise.all([
    monthTasksQuery,
    quotasQuery
  ]);

  const usedByDept = new Map<string, number>();
  for (const r of (monthTasks ?? []) as Array<{ department_id: string | null; credits_cost: number | string | null }>) {
    if (!r.department_id) continue;
    usedByDept.set(r.department_id, (usedByDept.get(r.department_id) ?? 0) + (Number(r.credits_cost) || 0));
  }
  let warnCount = 0;
  for (const q of (quotas ?? []) as Array<{ department_id: string; credits_limit: number }>) {
    const used = usedByDept.get(q.department_id) ?? 0;
    if (q.credits_limit > 0 && used / q.credits_limit >= 0.8) warnCount++;
  }

  // V1.6 Day 32:本月已通过报销 amount_cny 汇总
  // status='approved' 且 reviewed_at 在本月内;dept 维度时同步过滤
  let reimbQuery = supabase
    .from("reimbursement_requests")
    .select("amount_cny")
    .eq("status", "approved")
    .gte("reviewed_at", monthStart);
  if (deptId) reimbQuery = reimbQuery.eq("department_id", deptId);
  const { data: reimbRows } = await reimbQuery;
  const reimbCny = ((reimbRows ?? []) as Array<{ amount_cny: number | string }>)
    .reduce((s, r) => s + (Number(r.amount_cny) || 0), 0);

  const totalCnyRounded = Number(cny.toFixed(4));

  // Day 45 数据看板总览 KPI:环比上月。仅 range='month' 且全局(无 deptId)时填,
  // 其余调用方(manager dashboard / 其它 range)拿 null 跳过 MoM 展示。
  let prevTotalCalls: number | null = null;
  let prevCombinedCny: number | null = null;
  let prevCreditsConsumed: number | null = null;
  let prevReimbCnyOnly: number | null = null;
  if (range === "month" && !deptId) {
    const now = new Date();
    const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
    const prevEnd = monthStart;
    const [{ data: prevTasks }, { data: prevReimb }] = await Promise.all([
      supabase
        .from("generation_tasks")
        .select("cost_cny, credits_cost")
        .eq("status", "succeeded")
        .gte("created_at", prevStart)
        .lt("created_at", prevEnd),
      supabase
        .from("reimbursement_requests")
        .select("amount_cny")
        .eq("status", "approved")
        .gte("reviewed_at", prevStart)
        .lt("reviewed_at", prevEnd)
    ]);
    const prevRows = (prevTasks ?? []) as Array<{
      cost_cny: number | string | null;
      credits_cost: number | string | null;
    }>;
    const prevCny = prevRows.reduce((s, r) => s + (Number(r.cost_cny) || 0), 0);
    const prevCredits = prevRows.reduce((s, r) => s + (Number(r.credits_cost) || 0), 0);
    const prevReimbCny = (
      (prevReimb ?? []) as Array<{ amount_cny: number | string }>
    ).reduce((s, r) => s + (Number(r.amount_cny) || 0), 0);
    prevTotalCalls = prevRows.length;
    prevCombinedCny = Number((prevCny + prevReimbCny).toFixed(2));
    prevCreditsConsumed = Math.round(prevCredits);
    prevReimbCnyOnly = Number(prevReimbCny.toFixed(2));
  }

  return {
    total_calls: rows.length,
    total_credits: credits,
    total_cny: totalCnyRounded,
    active_departments: deptId ? 1 : deptSet.size, // dept-scoped 固定 1
    active_users: userSet.size,
    quota_warning_count: warnCount,
    total_reimbursement_cny: Number(reimbCny.toFixed(2)),
    total_combined_cny: Number((totalCnyRounded + reimbCny).toFixed(2)),
    prev_total_calls: prevTotalCalls,
    prev_combined_cny: prevCombinedCny,
    // Day 45 续:¥/积分 概念分离的两个新字段
    total_credits_consumed: Math.round(credits),
    prev_total_credits_consumed: prevCreditsConsumed,
    prev_total_reimbursement_cny: prevReimbCnyOnly,
    range
  };
}

// ─── Day 45 数据看板总览:全员数(KPI#3「本月活跃员工 N / 全员 M」分母)──────
export async function getTotalUserCount(): Promise<number> {
  const supabase = getServerClient();
  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

// ─── Day 45 数据看板总览:支出构成条(§3.22 spend-card 4 段)─────────────────
// 平台调用(generation_tasks.cost_cny)+ 工具订阅(reimbursement payment_type ∈ {monthly,
// annual, plugin})+ API 充值(api_topup)+ 其它(one_time)。
// 仅算 approved 报销且 reviewed_at 在 range 内;平台口径同 getAdminKpi。

export type SpendBreakdown = {
  platform_cny: number;
  reimb_subscription_cny: number;
  reimb_api_topup_cny: number;
  reimb_other_cny: number;
  total_cny: number;
};

export async function getSpendBreakdown(range: DateRange = "month"): Promise<SpendBreakdown> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);

  const [{ data: tasks }, { data: reimbs }] = await Promise.all([
    supabase
      .from("generation_tasks")
      .select("cost_cny")
      .eq("status", "succeeded")
      .gte("created_at", since),
    supabase
      .from("reimbursement_requests")
      .select("amount_cny, payment_type")
      .eq("status", "approved")
      .gte("reviewed_at", since)
  ]);

  const platformCny = ((tasks ?? []) as Array<{ cost_cny: number | string | null }>).reduce(
    (s, r) => s + (Number(r.cost_cny) || 0),
    0
  );
  let subCny = 0;
  let topupCny = 0;
  let otherCny = 0;
  for (const r of (reimbs ?? []) as Array<{ amount_cny: number | string; payment_type: string }>) {
    const amt = Number(r.amount_cny) || 0;
    if (r.payment_type === "monthly" || r.payment_type === "annual" || r.payment_type === "plugin") {
      subCny += amt;
    } else if (r.payment_type === "api_topup") {
      topupCny += amt;
    } else {
      otherCny += amt; // one_time / 未来未知类型
    }
  }
  const r2 = (n: number) => Number(n.toFixed(2));
  return {
    platform_cny: r2(platformCny),
    reimb_subscription_cny: r2(subCny),
    reimb_api_topup_cny: r2(topupCny),
    reimb_other_cny: r2(otherCny),
    total_cny: r2(platformCny + subCny + topupCny + otherCny)
  };
}

// ─── Day 45 数据看板总览:需要关注列表(alerts)─────────────────────────────
// 两类来源:超配额/接近配额的部门(pct ≥ 85)+ 待审报销摘要
// flagged prompt 一类按 Day 45 决策暂不实现(无 schema 支持)

export type AdminAlert = {
  severity: "warn" | "danger";
  text: string;
  href: string;
};

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const supabase = getServerClient();
  const alerts: AdminAlert[] = [];

  // 1) 部门用量 ≥ 85% / 100%
  const depts = await listDepartmentUsage("month");
  for (const d of depts) {
    if (d.credits_limit <= 0) continue;
    const pct = Math.round(d.usage_ratio * 100);
    if (pct >= 100) {
      alerts.push({
        severity: "danger",
        text: `${d.department_name} 已用 ${pct}% 月配额(${d.credits_used.toLocaleString()} / ${d.credits_limit.toLocaleString()})`,
        href: "/manage?tab=quota"
      });
    } else if (pct >= 85) {
      alerts.push({
        severity: "warn",
        text: `${d.department_name} 已用 ${pct}% 月配额,接近上限`,
        href: "/manage?tab=quota"
      });
    }
  }

  // 2) 待审报销
  const { data: pending } = await supabase
    .from("reimbursement_requests")
    .select("amount_cny")
    .eq("status", "pending");
  const pendingRows = (pending ?? []) as Array<{ amount_cny: number | string }>;
  if (pendingRows.length > 0) {
    const sum = pendingRows.reduce((s, r) => s + (Number(r.amount_cny) || 0), 0);
    alerts.push({
      severity: pendingRows.length >= 5 ? "danger" : "warn",
      text: `${pendingRows.length} 笔报销待审 · ¥${sum.toFixed(2)}`,
      href: "/manage?tab=audit&filter=pending"
    });
  }

  return alerts;
}

// ─── V1.6 报销数据统计(admin 报销 sub tab 用) ─────────────────────────
// 按部门 / 工具 / 月聚合,只统计 approved
export type ReimbursementStatsRow<K extends string> = {
  key: K;
  label: string;
  count: number;
  total_cny: number;
  // Day 45 数据看板/报销支出 dept 表加齐 7 列(仅 by_dept 行填,by_tool 行不填)
  platform_cny?: number; // 同部门本月 generation_tasks.cost_cny 折算
  top_tool?: string | null; // 该部门本月被报销最多的工具名(频次最高,平票取金额高)
  combined_cny?: number; // platform_cny + total_cny
};

export type ReimbursementStats = {
  total_count: number;
  total_cny: number;
  by_dept: Array<ReimbursementStatsRow<string>>;
  by_tool: Array<ReimbursementStatsRow<string>>;
  by_month: Array<{ month: string; count: number; total_cny: number }>; // 近 6 个月
  // Day 45 stat-quad:状态拆分(.stat-quad 4 mini-stat 用)
  // pending:全部 pending(不限时);approved/rejected:reviewed_at 在 range 内
  status_breakdown: {
    pending: { count: number; cny: number };
    approved: { count: number; cny: number };
    rejected: { count: number; cny: number };
  };
  range: DateRange;
};

export async function getReimbursementStats(
  range: DateRange = "month"
): Promise<ReimbursementStats> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);

  // 主体:取 since 内 approved 行 + join 部门名;同时拉近 6 个月聚合
  const sixMonthStart = new Date();
  sixMonthStart.setUTCMonth(sixMonthStart.getUTCMonth() - 5);
  sixMonthStart.setUTCDate(1);
  sixMonthStart.setUTCHours(0, 0, 0, 0);
  const sixMonthIso = sixMonthStart.toISOString();

  const [mainRes, sixMonthRes, platformRes, pendingRes, rejectedRes] = await Promise.all([
    supabase
      .from("reimbursement_requests")
      .select("amount_cny, department_id, tool_name, departments!department_id(name)")
      .eq("status", "approved")
      .gte("reviewed_at", since),
    supabase
      .from("reimbursement_requests")
      .select("amount_cny, reviewed_at")
      .eq("status", "approved")
      .gte("reviewed_at", sixMonthIso),
    // Day 45:同 range 内按部门聚合「平台调用折算」(generation_tasks.cost_cny)
    supabase
      .from("generation_tasks")
      .select("department_id, cost_cny")
      .eq("status", "succeeded")
      .gte("created_at", since),
    // Day 45 stat-quad 待审核(全量,不限时间)
    supabase
      .from("reimbursement_requests")
      .select("amount_cny")
      .eq("status", "pending"),
    // Day 45 stat-quad 本 range 已驳回(用 reviewed_at)
    supabase
      .from("reimbursement_requests")
      .select("amount_cny")
      .eq("status", "rejected")
      .gte("reviewed_at", since)
  ]);

  type MainRow = {
    amount_cny: number | string;
    department_id: string | null;
    tool_name: string;
    departments: { name: string } | { name: string }[] | null;
  };
  const rows = ((mainRes.data ?? []) as Array<MainRow>).map(r => {
    const dept = Array.isArray(r.departments) ? r.departments[0] : r.departments;
    return {
      amount_cny: Number(r.amount_cny) || 0,
      department_id: r.department_id ?? "_unknown_",
      department_name: dept?.name ?? "(未分配)",
      tool_name: r.tool_name
    };
  });

  const byDeptMap = new Map<string, { key: string; label: string; count: number; total_cny: number }>();
  const byToolMap = new Map<string, { key: string; label: string; count: number; total_cny: number }>();
  // Day 45:为部门行额外累计「该部门各工具的报销次数 + 金额」用于挑 top_tool
  const deptToolMap = new Map<string, Map<string, { count: number; cny: number }>>();
  for (const r of rows) {
    const dKey = r.department_id;
    const d = byDeptMap.get(dKey) ?? { key: dKey, label: r.department_name, count: 0, total_cny: 0 };
    d.count++;
    d.total_cny += r.amount_cny;
    byDeptMap.set(dKey, d);

    const t = byToolMap.get(r.tool_name) ?? { key: r.tool_name, label: r.tool_name, count: 0, total_cny: 0 };
    t.count++;
    t.total_cny += r.amount_cny;
    byToolMap.set(r.tool_name, t);

    let toolMap = deptToolMap.get(dKey);
    if (!toolMap) {
      toolMap = new Map();
      deptToolMap.set(dKey, toolMap);
    }
    const entry = toolMap.get(r.tool_name) ?? { count: 0, cny: 0 };
    entry.count++;
    entry.cny += r.amount_cny;
    toolMap.set(r.tool_name, entry);
  }

  // Day 45:同 range 内每部门平台调用折算
  const platformByDept = new Map<string, number>();
  for (const r of (platformRes.data ?? []) as Array<{
    department_id: string | null;
    cost_cny: number | string | null;
  }>) {
    const dKey = r.department_id ?? "_unknown_";
    platformByDept.set(dKey, (platformByDept.get(dKey) ?? 0) + (Number(r.cost_cny) || 0));
  }

  // 近 6 个月按月聚合
  const monthMap = new Map<string, { count: number; total_cny: number }>();
  for (const r of (sixMonthRes.data ?? []) as Array<{ amount_cny: number | string; reviewed_at: string }>) {
    const month = (r.reviewed_at ?? "").slice(0, 7); // YYYY-MM
    if (!month) continue;
    const e = monthMap.get(month) ?? { count: 0, total_cny: 0 };
    e.count++;
    e.total_cny += Number(r.amount_cny) || 0;
    monthMap.set(month, e);
  }
  // 补齐近 6 个月(0 填充让趋势完整)
  const byMonth: Array<{ month: string; count: number; total_cny: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - i);
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const e = monthMap.get(month) ?? { count: 0, total_cny: 0 };
    byMonth.push({ month, count: e.count, total_cny: Number(e.total_cny.toFixed(2)) });
  }

  const round = (n: number) => Number(n.toFixed(2));

  // Day 45 by_dept 加 platform_cny / top_tool / combined_cny;by_dept 还需把"无报销但有平台调用"的部门也带进来,否则报销表会漏部门
  const allDeptIds = new Set<string>([...byDeptMap.keys(), ...platformByDept.keys()]);
  // 兜底:platformOnly 行的 label 用 mainRes 里没出现过 → 走 departments 表反查;为避免再发 1 个查询,这里用 "(未知部门)" 兜底,实际生产中 platformOnly 几乎不出现(有调用必有 dept)
  const byDeptOut: ReimbursementStatsRow<string>[] = [];
  for (const dKey of allDeptIds) {
    const base = byDeptMap.get(dKey) ?? { key: dKey, label: "(未分配)", count: 0, total_cny: 0 };
    const platformCny = platformByDept.get(dKey) ?? 0;
    // top_tool:取频次最高;频次相同取金额高
    let topTool: string | null = null;
    const toolMap = deptToolMap.get(dKey);
    if (toolMap) {
      let best: { name: string; count: number; cny: number } | null = null;
      for (const [name, e] of toolMap.entries()) {
        if (
          !best ||
          e.count > best.count ||
          (e.count === best.count && e.cny > best.cny)
        ) {
          best = { name, count: e.count, cny: e.cny };
        }
      }
      topTool = best?.name ?? null;
    }
    byDeptOut.push({
      ...base,
      total_cny: round(base.total_cny),
      platform_cny: round(platformCny),
      top_tool: topTool,
      combined_cny: round(base.total_cny + platformCny)
    });
  }
  byDeptOut.sort((a, b) => (b.combined_cny ?? 0) - (a.combined_cny ?? 0));

  // Day 45 stat-quad status_breakdown
  const sumCny = (data: unknown) =>
    ((data ?? []) as Array<{ amount_cny: number | string }>).reduce(
      (s, r) => s + (Number(r.amount_cny) || 0),
      0
    );
  const pendingRows = (pendingRes.data ?? []) as Array<{ amount_cny: number | string }>;
  const rejectedRows = (rejectedRes.data ?? []) as Array<{ amount_cny: number | string }>;
  const approvedCny = rows.reduce((s, r) => s + r.amount_cny, 0);

  return {
    total_count: rows.length,
    total_cny: round(approvedCny),
    by_dept: byDeptOut,
    by_tool: [...byToolMap.values()].map(t => ({ ...t, total_cny: round(t.total_cny) })).sort((a, b) => b.total_cny - a.total_cny),
    by_month: byMonth,
    status_breakdown: {
      pending: { count: pendingRows.length, cny: round(sumCny(pendingRes.data)) },
      approved: { count: rows.length, cny: round(approvedCny) },
      rejected: { count: rejectedRows.length, cny: round(sumCny(rejectedRes.data)) }
    },
    range
  };
}

// ─── 部门排行表 ───────────────────────────────────────────────────────────
export type DeptUsageRow = {
  department_id: string;
  department_name: string;
  call_count: number;
  credits_used: number;
  credits_limit: number;
  usage_ratio: number; // used / limit
};

export async function listDepartmentUsage(range: DateRange = "month"): Promise<DeptUsageRow[]> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);
  const monthStart = firstOfMonthIso();

  const [{ data: depts }, { data: tasks }, { data: quotas }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("generation_tasks")
      .select("department_id, credits_cost")
      .eq("status", "succeeded")
      .gte("created_at", since),
    supabase.from("quotas").select("department_id, credits_limit").eq("month", monthStart.slice(0, 10))
  ]);

  const callByDept = new Map<string, number>();
  const creditsByDept = new Map<string, number>();
  for (const r of (tasks ?? []) as Array<{ department_id: string | null; credits_cost: number | string | null }>) {
    if (!r.department_id) continue;
    callByDept.set(r.department_id, (callByDept.get(r.department_id) ?? 0) + 1);
    creditsByDept.set(r.department_id, (creditsByDept.get(r.department_id) ?? 0) + (Number(r.credits_cost) || 0));
  }
  const limitByDept = new Map<string, number>();
  for (const q of (quotas ?? []) as Array<{ department_id: string; credits_limit: number }>) {
    limitByDept.set(q.department_id, q.credits_limit);
  }

  return ((depts ?? []) as Array<{ id: string; name: string }>)
    .map(d => {
      const credits = creditsByDept.get(d.id) ?? 0;
      const limit = limitByDept.get(d.id) ?? 0;
      return {
        department_id: d.id,
        department_name: d.name,
        call_count: callByDept.get(d.id) ?? 0,
        credits_used: credits,
        credits_limit: limit,
        usage_ratio: limit > 0 ? credits / limit : 0
      };
    })
    .sort((a, b) => b.credits_used - a.credits_used);
}

// ─── 趋势图(单线公司总量,MVP 简化)──────────────────────────────────
export type TrendPoint = { date: string; credits: number; calls: number };

export async function getDailyTrend(range: DateRange = "30d", deptId?: string): Promise<TrendPoint[]> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);
  let q = supabase
    .from("generation_tasks")
    .select("created_at, credits_cost")
    .eq("status", "succeeded")
    .gte("created_at", since)
    .order("created_at");
  if (deptId) q = q.eq("department_id", deptId);
  const { data: tasks } = await q;

  // 按 range 粒度归桶（日/月/季/年）
  const gran = rangeGranularity(range);
  const bucketMap = new Map<string, { credits: number; calls: number }>();
  for (const r of (tasks ?? []) as Array<{ created_at: string; credits_cost: number | string | null }>) {
    const key = bucketKey(r.created_at, gran);
    const e = bucketMap.get(key) ?? { credits: 0, calls: 0 };
    e.credits += Number(r.credits_cost) || 0;
    e.calls += 1;
    bucketMap.set(key, e);
  }

  // 用 rangeBuckets 补齐空桶 → 趋势平滑
  const buckets = rangeBuckets(range);
  return buckets.map((key) => {
    const e = bucketMap.get(key);
    return { date: key, credits: e?.credits ?? 0, calls: e?.calls ?? 0 };
  });
}

// V1.13 按部门拆色多线趋势(admin 看板用)
// 5 个固定调色板,按 departments 表 name 排序后稳定分配色;>5 部门走灰色 fallback
const DEPT_COLORS = ["#2B6CFE", "#7A4BFF", "#1F9D55", "#E08C12", "#E5484D"]; // primary / violet / success / warn / danger

export type TrendSeries = {
  department_id: string;
  department_name: string;
  color: string;
  points: Array<{ key: string; credits: number; calls: number }>;
};

export type MultiTrend = {
  range: DateRange;
  granularity: "day" | "week" | "month" | "quarter" | "year";
  bucket_keys: string[];
  series: TrendSeries[];
};

export async function getDailyTrendByDept(range: DateRange = "30d"): Promise<MultiTrend> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);
  const gran = rangeGranularity(range);
  const buckets = rangeBuckets(range);

  const [{ data: depts }, { data: tasks }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("generation_tasks")
      .select("department_id, credits_cost, created_at")
      .eq("status", "succeeded")
      .gte("created_at", since)
  ]);

  const deptRows = (depts ?? []) as Array<{ id: string; name: string }>;

  // 初始化每个部门的桶 map
  const seriesMap = new Map<string, Map<string, { credits: number; calls: number }>>();
  for (const d of deptRows) {
    const m = new Map<string, { credits: number; calls: number }>();
    for (const k of buckets) m.set(k, { credits: 0, calls: 0 });
    seriesMap.set(d.id, m);
  }

  for (const r of (tasks ?? []) as Array<{ department_id: string | null; credits_cost: number | string | null; created_at: string }>) {
    if (!r.department_id) continue;
    const m = seriesMap.get(r.department_id);
    if (!m) continue;
    const key = bucketKey(r.created_at, gran);
    const e = m.get(key);
    if (!e) continue;
    e.credits += Number(r.credits_cost) || 0;
    e.calls += 1;
  }

  const series: TrendSeries[] = deptRows.map((d, idx) => ({
    department_id: d.id,
    department_name: d.name,
    color: DEPT_COLORS[idx % DEPT_COLORS.length] ?? "#A0A6B2",
    points: buckets.map(k => ({ key: k, ...(seriesMap.get(d.id)!.get(k)!) }))
  }));

  return { range, granularity: gran, bucket_keys: buckets, series };
}

// ─── 模块分布 ─────────────────────────────────────────────────────────────
// V1.5 Day 30:三个函数加 optional deptId 让 manager dashboard 复用
export async function getTypeDistribution(range: DateRange = "month", deptId?: string): Promise<Array<{ type: string; count: number }>> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);
  let q = supabase
    .from("generation_tasks")
    .select("type")
    .eq("status", "succeeded")
    .gte("created_at", since);
  if (deptId) q = q.eq("department_id", deptId);
  const { data: tasks } = await q;
  const m = new Map<string, number>();
  for (const r of (tasks ?? []) as Array<{ type: string }>) m.set(r.type, (m.get(r.type) ?? 0) + 1);
  return ["image", "video"].map(t => ({ type: t, count: m.get(t) ?? 0 }));
}

// Day 45 续:返回值加 credits 字段(按积分排序的视图复用)
export async function getModelTopN(
  range: DateRange = "month",
  limit = 8,
  deptId?: string
): Promise<Array<{ model_name: string; count: number; credits: number }>> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);
  let q = supabase
    .from("generation_tasks")
    .select("model_name, credits_cost")
    .eq("status", "succeeded")
    .gte("created_at", since);
  if (deptId) q = q.eq("department_id", deptId);
  const { data: tasks } = await q;
  const m = new Map<string, { count: number; credits: number }>();
  for (const r of (tasks ?? []) as Array<{
    model_name: string;
    credits_cost: number | string | null;
  }>) {
    const e = m.get(r.model_name) ?? { count: 0, credits: 0 };
    e.count++;
    e.credits += Number(r.credits_cost) || 0;
    m.set(r.model_name, e);
  }
  return [...m.entries()]
    .map(([model_name, e]) => ({
      model_name,
      count: e.count,
      credits: Math.round(e.credits)
    }))
    .sort((a, b) => b.credits - a.credits || b.count - a.count)
    .slice(0, limit);
}

// V1.14 数据看板 · 模型异动：按自定义时间窗口取 model top
// 用于环比（本月 vs 上月），辅助 admin Credit context 的"模型异动"列表
export async function getModelTopByDateWindow(args: {
  date_from: string;
  date_to?: string; // exclusive；省略表示到 now
  limit?: number;
  dept_id?: string;
}): Promise<Array<{ model_name: string; count: number; credits: number }>> {
  const supabase = getServerClient();
  let q = supabase
    .from("generation_tasks")
    .select("model_name, credits_cost")
    .eq("status", "succeeded")
    .gte("created_at", args.date_from);
  if (args.date_to) q = q.lt("created_at", args.date_to);
  if (args.dept_id) q = q.eq("department_id", args.dept_id);
  const { data: tasks } = await q;
  const m = new Map<string, { count: number; credits: number }>();
  for (const r of (tasks ?? []) as Array<{
    model_name: string;
    credits_cost: number | string | null;
  }>) {
    const e = m.get(r.model_name) ?? { count: 0, credits: 0 };
    e.count++;
    e.credits += Number(r.credits_cost) || 0;
    m.set(r.model_name, e);
  }
  return [...m.entries()]
    .map(([model_name, e]) => ({
      model_name,
      count: e.count,
      credits: Math.round(e.credits)
    }))
    .sort((a, b) => b.credits - a.credits || b.count - a.count)
    .slice(0, args.limit ?? 50);
}

// ─── 模型详情 4 个查询（AI 洞察"模型异动"行内展开用） ────────────────────

/** 该模型最近 N 月按月聚合的积分趋势（月柱图用） */
export async function getModelMonthlyTrend(
  modelName: string,
  months = 6
): Promise<Array<{ month: string; credits: number; count: number }>> {
  const supabase = getServerClient();
  const now = new Date();
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)
  );
  const { data } = await supabase
    .from("generation_tasks")
    .select("created_at, credits_cost")
    .eq("model_name", modelName)
    .eq("status", "succeeded")
    .gte("created_at", startDate.toISOString());

  // 预填 N 个月，缺失补 0
  const buckets = new Map<string, { credits: number; count: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + i, 1)
    );
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { credits: 0, count: 0 });
  }
  for (const r of (data ?? []) as Array<{ created_at: string; credits_cost: number | string | null }>) {
    const key = r.created_at.slice(0, 7);
    if (!buckets.has(key)) continue;
    const e = buckets.get(key)!;
    e.credits += Number(r.credits_cost) || 0;
    e.count++;
  }
  return [...buckets.entries()].map(([month, e]) => ({
    month,
    credits: Math.round(e.credits),
    count: e.count
  }));
}

/** 该模型最近 N 天每日积分趋势（mini sparkline，旧版保留兼容） */
export async function getModelDailyTrend(
  modelName: string,
  days = 14
): Promise<Array<{ d: string; credits: number; count: number }>> {
  const supabase = getServerClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await supabase
    .from("generation_tasks")
    .select("created_at, credits_cost")
    .eq("model_name", modelName)
    .eq("status", "succeeded")
    .gte("created_at", since);

  const buckets = new Map<string, { credits: number; count: number }>();
  // 预填 N 天，缺失日期补 0
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { credits: 0, count: 0 });
  }
  for (const r of (data ?? []) as Array<{ created_at: string; credits_cost: number | string | null }>) {
    const key = r.created_at.slice(0, 10);
    if (!buckets.has(key)) continue;
    const e = buckets.get(key)!;
    e.credits += Number(r.credits_cost) || 0;
    e.count++;
  }
  return [...buckets.entries()].map(([d, e]) => ({
    d: `${d.slice(5, 7)}.${d.slice(8, 10)}`,
    credits: Math.round(e.credits),
    count: e.count
  }));
}

/** 该模型按部门拆分（本月） */
export async function getModelByDept(
  modelName: string,
  month?: string
): Promise<Array<{ department_id: string | null; department_name: string; credits: number; count: number }>> {
  const supabase = getServerClient();
  const { from, to } = monthRangeIso(month);
  const [{ data: tasks }, { data: depts }] = await Promise.all([
    supabase
      .from("generation_tasks")
      .select("department_id, credits_cost")
      .eq("model_name", modelName)
      .eq("status", "succeeded")
      .gte("created_at", from)
      .lt("created_at", to),
    supabase.from("departments").select("id, name")
  ]);
  const nameMap = new Map<string, string>();
  for (const d of (depts ?? []) as Array<{ id: string; name: string }>) {
    nameMap.set(d.id, d.name);
  }
  const m = new Map<string | null, { credits: number; count: number }>();
  for (const r of (tasks ?? []) as Array<{ department_id: string | null; credits_cost: number | string | null }>) {
    const k = r.department_id ?? null;
    const e = m.get(k) ?? { credits: 0, count: 0 };
    e.credits += Number(r.credits_cost) || 0;
    e.count++;
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([department_id, e]) => ({
      department_id,
      department_name: department_id ? nameMap.get(department_id) ?? "(未知)" : "(未分配)",
      credits: Math.round(e.credits),
      count: e.count
    }))
    .sort((a, b) => b.credits - a.credits);
}

/** 该模型按用途拆分（指定月份，默认本月） */
export async function getModelByPurpose(
  modelName: string,
  month?: string
): Promise<Array<{ purpose_tag_name: string; credits: number; count: number }>> {
  const supabase = getServerClient();
  const { from, to } = monthRangeIso(month);
  const { data } = await supabase
    .from("generation_tasks")
    .select("purpose_tag_name, credits_cost")
    .eq("model_name", modelName)
    .eq("status", "succeeded")
    .gte("created_at", from)
    .lt("created_at", to);
  const m = new Map<string, { credits: number; count: number }>();
  for (const r of (data ?? []) as Array<{ purpose_tag_name: string; credits_cost: number | string | null }>) {
    const e = m.get(r.purpose_tag_name) ?? { credits: 0, count: 0 };
    e.credits += Number(r.credits_cost) || 0;
    e.count++;
    m.set(r.purpose_tag_name, e);
  }
  return [...m.entries()]
    .map(([purpose_tag_name, e]) => ({
      purpose_tag_name,
      credits: Math.round(e.credits),
      count: e.count
    }))
    .sort((a, b) => b.credits - a.credits);
}

/** 同类型模型对比（指定月份，默认本月）— 用 models.type 取同类 + 各自单价指标 */
export async function getModelPeerCompare(
  modelName: string,
  month?: string
): Promise<{
  self_type: "image" | "video" | null;
  peers: Array<{
    model_name: string;
    credits: number;
    count: number;
    avg_credits_per_call: number;
    is_self: boolean;
  }>;
}> {
  const supabase = getServerClient();
  const { data: selfMeta } = await supabase
    .from("models")
    .select("type")
    .eq("name", modelName)
    .maybeSingle();
  const selfType = (selfMeta as { type: "image" | "video" } | null)?.type ?? null;
  if (!selfType) return { self_type: null, peers: [] };

  const { data: peerModels } = await supabase
    .from("models")
    .select("name")
    .eq("type", selfType);
  const peerNames = ((peerModels ?? []) as Array<{ name: string }>).map((m) => m.name);
  if (peerNames.length === 0) return { self_type: selfType, peers: [] };

  const { from, to } = monthRangeIso(month);
  const { data: tasks } = await supabase
    .from("generation_tasks")
    .select("model_name, credits_cost")
    .eq("status", "succeeded")
    .gte("created_at", from)
    .lt("created_at", to)
    .in("model_name", peerNames);

  const m = new Map<string, { credits: number; count: number }>();
  for (const r of (tasks ?? []) as Array<{ model_name: string; credits_cost: number | string | null }>) {
    const e = m.get(r.model_name) ?? { credits: 0, count: 0 };
    e.credits += Number(r.credits_cost) || 0;
    e.count++;
    m.set(r.model_name, e);
  }
  const peers = peerNames
    .map((name) => {
      const e = m.get(name) ?? { credits: 0, count: 0 };
      return {
        model_name: name,
        credits: Math.round(e.credits),
        count: e.count,
        avg_credits_per_call: e.count > 0 ? Math.round(e.credits / e.count) : 0,
        is_self: name === modelName
      };
    })
    .sort((a, b) => b.credits - a.credits);
  return { self_type: selfType, peers };
}

export async function getPurposeDistribution(range: DateRange = "month", deptId?: string): Promise<Array<{ purpose_tag_name: string; count: number }>> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);
  let q = supabase
    .from("generation_tasks")
    .select("purpose_tag_name")
    .eq("status", "succeeded")
    .gte("created_at", since);
  if (deptId) q = q.eq("department_id", deptId);
  const { data: tasks } = await q;
  const m = new Map<string, number>();
  for (const r of (tasks ?? []) as Array<{ purpose_tag_name: string }>) m.set(r.purpose_tag_name, (m.get(r.purpose_tag_name) ?? 0) + 1);
  return [...m.entries()]
    .map(([purpose_tag_name, count]) => ({ purpose_tag_name, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── Day 45 续:部门 × 类型 交叉(用量分析 tab 部门表)──────────────────────
// 替代原 listDepartmentUsage(其只给单一 credits_used 维度,不区分 image/video)

export type DeptUsageCrossRow = {
  department_id: string;
  department_name: string;
  image_count: number;
  image_credits: number;
  video_count: number;
  video_credits: number;
  total_count: number;
  total_credits: number;
};

export async function listDepartmentUsageByType(
  range: DateRange = "month"
): Promise<DeptUsageCrossRow[]> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);
  const [{ data: depts }, { data: tasks }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("generation_tasks")
      .select("department_id, type, credits_cost")
      .eq("status", "succeeded")
      .gte("created_at", since)
  ]);

  const map = new Map<
    string,
    { image_count: number; image_credits: number; video_count: number; video_credits: number }
  >();
  for (const r of (tasks ?? []) as Array<{
    department_id: string | null;
    type: string;
    credits_cost: number | string | null;
  }>) {
    if (!r.department_id) continue;
    const e = map.get(r.department_id) ?? {
      image_count: 0,
      image_credits: 0,
      video_count: 0,
      video_credits: 0
    };
    const credits = Number(r.credits_cost) || 0;
    if (r.type === "video") {
      e.video_count++;
      e.video_credits += credits;
    } else {
      e.image_count++;
      e.image_credits += credits;
    }
    map.set(r.department_id, e);
  }

  const out: DeptUsageCrossRow[] = ((depts ?? []) as Array<{ id: string; name: string }>).map(d => {
    const e = map.get(d.id) ?? {
      image_count: 0,
      image_credits: 0,
      video_count: 0,
      video_credits: 0
    };
    return {
      department_id: d.id,
      department_name: d.name,
      image_count: e.image_count,
      image_credits: Math.round(e.image_credits),
      video_count: e.video_count,
      video_credits: Math.round(e.video_credits),
      total_count: e.image_count + e.video_count,
      total_credits: Math.round(e.image_credits + e.video_credits)
    };
  });
  // 按总积分降序;0 调用部门排末尾
  out.sort((a, b) => b.total_credits - a.total_credits || b.total_count - a.total_count);
  return out;
}

// ─── Day 45 续:目的 × 类型 交叉(用量分析 tab 目的表)──────────────────────
// 让 admin 看出"哪个使用目的偏图、哪个偏视频"

export type PurposeUsageCrossRow = {
  purpose_tag_name: string;
  image_count: number;
  video_count: number;
  total_count: number;
};

export async function getPurposeDistributionByType(
  range: DateRange = "month"
): Promise<PurposeUsageCrossRow[]> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);
  const { data: tasks } = await supabase
    .from("generation_tasks")
    .select("purpose_tag_name, type")
    .eq("status", "succeeded")
    .gte("created_at", since);

  const map = new Map<string, { image_count: number; video_count: number }>();
  for (const r of (tasks ?? []) as Array<{ purpose_tag_name: string; type: string }>) {
    const e = map.get(r.purpose_tag_name) ?? { image_count: 0, video_count: 0 };
    if (r.type === "video") e.video_count++;
    else e.image_count++;
    map.set(r.purpose_tag_name, e);
  }
  return [...map.entries()]
    .map(([purpose_tag_name, e]) => ({
      purpose_tag_name,
      image_count: e.image_count,
      video_count: e.video_count,
      total_count: e.image_count + e.video_count
    }))
    .sort((a, b) => b.total_count - a.total_count);
}

// V1.5 Day 30:本部门员工排行(manager dashboard 替代 admin 的部门排行表)
export type DeptMemberRow = {
  user_id: string;
  user_name: string;
  email: string;
  call_count: number;
  credits_used: number;
};

export type MemberWeeklyRow = {
  user_id: string;
  user_name: string;
  email: string;
  this_week_credits: number;
  prev_week_credits: number;
  this_week_count: number;
  prev_week_count: number;
  /** 本周/上周倍数；prev=0 且 this>0 时为 null（视为"新激活"） */
  ratio: number | null;
};

/** 部门成员本周 vs 上周对比 — manager 员工异动卡 + admin user-spike 下钻共用 */
export async function listDeptMemberWeeklyComparison(
  deptId: string
): Promise<MemberWeeklyRow[]> {
  const supabase = getServerClient();
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setUTCDate(now.getUTCDate() - 7);
  const prevWeekStart = new Date(now);
  prevWeekStart.setUTCDate(now.getUTCDate() - 14);

  const [{ data: users }, { data: tasks }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email")
      .eq("department_id", deptId)
      .order("name"),
    supabase
      .from("generation_tasks")
      .select("user_id, credits_cost, created_at")
      .eq("department_id", deptId)
      .eq("status", "succeeded")
      .gte("created_at", prevWeekStart.toISOString())
  ]);

  type Agg = { credits: number; count: number };
  const map = new Map<string, { thisWeek: Agg; prevWeek: Agg }>();
  for (const t of (tasks ?? []) as Array<{
    user_id: string | null;
    credits_cost: number | string | null;
    created_at: string;
  }>) {
    if (!t.user_id) continue;
    if (!map.has(t.user_id)) {
      map.set(t.user_id, {
        thisWeek: { credits: 0, count: 0 },
        prevWeek: { credits: 0, count: 0 }
      });
    }
    const e = map.get(t.user_id)!;
    const isThisWeek = new Date(t.created_at) >= thisWeekStart;
    const b = isThisWeek ? e.thisWeek : e.prevWeek;
    b.credits += Number(t.credits_cost) || 0;
    b.count++;
  }

  type UserRow = { id: string; name: string; email: string };
  const out: MemberWeeklyRow[] = ((users ?? []) as UserRow[]).map((u) => {
    const agg = map.get(u.id) ?? {
      thisWeek: { credits: 0, count: 0 },
      prevWeek: { credits: 0, count: 0 }
    };
    let ratio: number | null;
    if (agg.prevWeek.credits === 0) {
      ratio = agg.thisWeek.credits > 0 ? null : 1; // 新激活 / 完全静默
    } else {
      ratio = agg.thisWeek.credits / agg.prevWeek.credits;
    }
    return {
      user_id: u.id,
      user_name: u.name,
      email: u.email,
      this_week_credits: Math.round(agg.thisWeek.credits),
      prev_week_credits: Math.round(agg.prevWeek.credits),
      this_week_count: agg.thisWeek.count,
      prev_week_count: agg.prevWeek.count,
      ratio
    };
  });

  // 排序：新激活在最前（ratio=null + this>0），其后按 ratio 降序
  out.sort((a, b) => {
    const aActive = a.this_week_credits > 0;
    const bActive = b.this_week_credits > 0;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    if (a.ratio === null && b.ratio !== null) return -1;
    if (b.ratio === null && a.ratio !== null) return 1;
    return (b.ratio ?? 0) - (a.ratio ?? 0);
  });
  return out;
}

export async function listDeptMemberUsage(deptId: string, range: DateRange = "month"): Promise<DeptMemberRow[]> {
  const supabase = getServerClient();
  const since = dateRangeStart(range);

  const [{ data: deptUsers }, { data: tasks }] = await Promise.all([
    supabase.from("users").select("id, name, email").eq("department_id", deptId).order("name"),
    supabase
      .from("generation_tasks")
      .select("user_id, credits_cost")
      .eq("department_id", deptId)
      .eq("status", "succeeded")
      .gte("created_at", since)
  ]);

  const callByUser = new Map<string, number>();
  const creditsByUser = new Map<string, number>();
  for (const r of (tasks ?? []) as Array<{ user_id: string; credits_cost: number | string | null }>) {
    callByUser.set(r.user_id, (callByUser.get(r.user_id) ?? 0) + 1);
    creditsByUser.set(r.user_id, (creditsByUser.get(r.user_id) ?? 0) + (Number(r.credits_cost) || 0));
  }

  return ((deptUsers ?? []) as Array<{ id: string; name: string; email: string }>)
    .map(u => ({
      user_id: u.id,
      user_name: u.name,
      email: u.email,
      call_count: callByUser.get(u.id) ?? 0,
      credits_used: creditsByUser.get(u.id) ?? 0
    }))
    .sort((a, b) => b.credits_used - a.credits_used);
}

// 取单部门信息(给 manager dashboard 头部展示用)
export async function getDepartmentById(deptId: string): Promise<{ id: string; name: string } | null> {
  const supabase = getServerClient();
  const { data } = await supabase.from("departments").select("id, name").eq("id", deptId).maybeSingle();
  return data as { id: string; name: string } | null;
}

// ─── 配额管理 ─────────────────────────────────────────────────────────────
export type DeptQuotaRow = {
  department_id: string;
  department_name: string;
  credits_limit: number;
  credits_used: number;
  usage_ratio: number;
};

export async function listAllDepartmentQuotas(): Promise<DeptQuotaRow[]> {
  const supabase = getServerClient();
  const monthStart = firstOfMonthIso();
  const monthDate = monthStart.slice(0, 10);

  const [{ data: depts }, { data: quotas }, { data: tasks }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("quotas").select("department_id, credits_limit").eq("month", monthDate),
    supabase
      .from("generation_tasks")
      .select("department_id, credits_cost")
      .eq("status", "succeeded")
      .gte("created_at", monthStart)
  ]);

  const limitMap = new Map<string, number>();
  for (const q of (quotas ?? []) as Array<{ department_id: string; credits_limit: number }>) {
    limitMap.set(q.department_id, q.credits_limit);
  }
  const usedMap = new Map<string, number>();
  for (const t of (tasks ?? []) as Array<{ department_id: string | null; credits_cost: number | string | null }>) {
    if (!t.department_id) continue;
    usedMap.set(t.department_id, (usedMap.get(t.department_id) ?? 0) + (Number(t.credits_cost) || 0));
  }

  return ((depts ?? []) as Array<{ id: string; name: string }>).map(d => {
    const limit = limitMap.get(d.id) ?? 0;
    const used = usedMap.get(d.id) ?? 0;
    return {
      department_id: d.id,
      department_name: d.name,
      credits_limit: limit,
      credits_used: used,
      usage_ratio: limit > 0 ? used / limit : 0
    };
  });
}

export async function updateDepartmentQuota(deptId: string, newLimit: number): Promise<void> {
  const supabase = getServerClient();
  const monthDate = firstOfMonthIso().slice(0, 10);
  const { data: existing } = await supabase
    .from("quotas")
    .select("id")
    .eq("department_id", deptId)
    .eq("month", monthDate)
    .maybeSingle();
  if (existing) {
    await supabase.from("quotas").update({ credits_limit: newLimit }).eq("id", (existing as { id: string }).id);
  } else {
    await supabase.from("quotas").insert({ department_id: deptId, month: monthDate, credits_limit: newLimit });
  }
}

// V1.5 Day 31:manager 配额自调
// V1 简化:固定上限 10000(默认 5000 的 2x);V2 admin 可自定义"manager 授权上限"字段
// 返回 { old_limit, new_limit } 给 audit 用
export const MANAGER_QUOTA_LIMIT_CAP = 10000;

export class ManagerQuotaOverCapError extends Error {
  constructor(public newLimit: number, public cap: number) {
    super(`配额 ${newLimit} 超过 manager 调整上限 ${cap}`);
    this.name = "ManagerQuotaOverCapError";
  }
}

export async function updateDepartmentQuotaByManager(args: {
  deptId: string;
  newLimit: number;
}): Promise<{ old_limit: number; new_limit: number }> {
  if (!Number.isFinite(args.newLimit) || args.newLimit <= 0) {
    throw new Error("credits_limit must be > 0");
  }
  if (args.newLimit > MANAGER_QUOTA_LIMIT_CAP) {
    throw new ManagerQuotaOverCapError(args.newLimit, MANAGER_QUOTA_LIMIT_CAP);
  }
  const supabase = getServerClient();
  const monthDate = firstOfMonthIso().slice(0, 10);
  const { data: existing } = await supabase
    .from("quotas")
    .select("id, credits_limit")
    .eq("department_id", args.deptId)
    .eq("month", monthDate)
    .maybeSingle();
  const oldLimit = (existing as { id: string; credits_limit: number } | null)?.credits_limit ?? 0;
  if (existing) {
    await supabase
      .from("quotas")
      .update({ credits_limit: args.newLimit })
      .eq("id", (existing as { id: string }).id);
  } else {
    await supabase
      .from("quotas")
      .insert({ department_id: args.deptId, month: monthDate, credits_limit: args.newLimit });
  }
  return { old_limit: oldLimit, new_limit: args.newLimit };
}

// V1.8 admin Prompt 收藏监控:全员收藏聚合 + 筛选 + 分页
// prompt_collections.user_id 有 FK 到 users,可走 supabase 嵌套关联;但 users.department_id 链路一样要 2-步(快照逻辑不同,这里 prompt_collections 没有 department_id,只能 follow users.department_id 拿当前部门)
export type AdminCollectionRow = {
  id: number;
  user_id: string;
  user_name: string;
  user_email: string;
  user_department_name: string | null; // users.department_id → departments.name(注意:是用户当前部门,不是收藏时的快照)
  task_id: string | null;
  prompt_text: string;
  model_name: string;
  kind: "image" | "video";
  ratio_or_duration: string | null;
  reference_image_url: string | null;
  purpose_tag_name: string | null;
  title: string;
  tags: string | null;
  created_at: string;
};

export type AdminCollectionFilters = {
  kind?: "image" | "video";
  department_id?: string;
  user_id?: string;
  search?: string; // 在 prompt_text / title / tags 模糊查
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
};

export type AdminCollectionStats = {
  total: number;
  image_count: number;
  video_count: number;
  top_model: { name: string; count: number } | null;
  top_user: { name: string; count: number } | null;
};

export async function listAllCollectionsForAdmin(filters: AdminCollectionFilters): Promise<{
  rows: AdminCollectionRow[];
  stats: AdminCollectionStats;
  total: number;
  page: number;
  page_size: number;
}> {
  const supabase = getServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.page_size ?? 24));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 部门筛选:先查目标部门用户 id,再 IN 过滤(避免分页后再 filter 导致 total/rows 不准)
  let deptUserIds: string[] | null = null;
  if (filters.department_id) {
    const { data: deptUsers } = await supabase
      .from("users")
      .select("id")
      .eq("department_id", filters.department_id);
    deptUserIds = ((deptUsers ?? []) as Array<{ id: string }>).map(u => u.id);
    if (deptUserIds.length === 0) {
      return {
        rows: [],
        total: 0,
        page,
        page_size: pageSize,
        stats: {
          total: 0,
          image_count: 0,
          video_count: 0,
          top_model: null,
          top_user: null
        }
      };
    }
  }

  // 主体:join users + departments(prompt_collections.user_id FK,users.department_id FK)
  let query = supabase
    .from("prompt_collections")
    .select(
      "id, user_id, task_id, prompt_text, model_name, kind, ratio_or_duration, reference_image_url, purpose_tag_name, title, tags, created_at, users!user_id(name, email, department_id, departments(name))",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.user_id) query = query.eq("user_id", filters.user_id);
  if (deptUserIds) query = query.in("user_id", deptUserIds);
  if (filters.date_from) query = query.gte("created_at", filters.date_from);
  if (filters.date_to) query = query.lte("created_at", filters.date_to);
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim();
    query = query.or(`prompt_text.ilike.%${q}%,title.ilike.%${q}%,tags.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  type Raw = {
    id: number;
    user_id: string;
    task_id: string | null;
    prompt_text: string;
    model_name: string;
    kind: "image" | "video";
    ratio_or_duration: string | null;
    reference_image_url: string | null;
    purpose_tag_name: string | null;
    title: string;
    tags: string | null;
    created_at: string;
    users: {
      name: string;
      email: string;
      department_id: string | null;
      departments: { name: string } | { name: string }[] | null;
    } | Array<{
      name: string;
      email: string;
      department_id: string | null;
      departments: { name: string } | { name: string }[] | null;
    }> | null;
  };

  let rows: AdminCollectionRow[] = ((data ?? []) as Raw[]).map(r => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    const d = u ? (Array.isArray(u.departments) ? u.departments[0] : u.departments) : null;
    return {
      id: r.id,
      user_id: r.user_id,
      user_name: u?.name ?? "(已注销)",
      user_email: u?.email ?? "",
      user_department_name: d?.name ?? null,
      task_id: r.task_id,
      prompt_text: r.prompt_text,
      model_name: r.model_name,
      kind: r.kind,
      ratio_or_duration: r.ratio_or_duration,
      reference_image_url: r.reference_image_url,
      purpose_tag_name: r.purpose_tag_name,
      title: r.title,
      tags: r.tags,
      created_at: r.created_at
    };
  });

  // stats:全表汇总(忽略分页,但走相同 filter)— 简化用第二次轻量查
  let statsQuery = supabase
    .from("prompt_collections")
    .select("user_id, model_name, kind")
    .order("created_at", { ascending: false })
    .limit(500); // 简化:取最近 500 行算统计(V1 数据量小)
  if (filters.kind) statsQuery = statsQuery.eq("kind", filters.kind);
  if (filters.user_id) statsQuery = statsQuery.eq("user_id", filters.user_id);
  if (deptUserIds) statsQuery = statsQuery.in("user_id", deptUserIds);
  if (filters.date_from) statsQuery = statsQuery.gte("created_at", filters.date_from);
  if (filters.date_to) statsQuery = statsQuery.lte("created_at", filters.date_to);

  const { data: statsRows } = await statsQuery;
  const sArr = (statsRows ?? []) as Array<{ user_id: string; model_name: string; kind: "image" | "video" }>;
  const modelMap = new Map<string, number>();
  const userMap = new Map<string, number>();
  let imgC = 0, vidC = 0;
  for (const r of sArr) {
    modelMap.set(r.model_name, (modelMap.get(r.model_name) ?? 0) + 1);
    userMap.set(r.user_id, (userMap.get(r.user_id) ?? 0) + 1);
    if (r.kind === "image") imgC++; else vidC++;
  }
  const topModelEntry = [...modelMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const topUserId = [...userMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // 取 top user name
  let topUserName: string | null = null;
  if (topUserId) {
    const { data: u } = await supabase.from("users").select("name").eq("id", topUserId).maybeSingle();
    topUserName = (u as { name: string } | null)?.name ?? null;
  }

  return {
    rows,
    total: count ?? 0,
    page,
    page_size: pageSize,
    stats: {
      total: sArr.length,
      image_count: imgC,
      video_count: vidC,
      top_model: topModelEntry ? { name: topModelEntry[0], count: topModelEntry[1] } : null,
      top_user: topUserName && topUserId ? { name: topUserName, count: userMap.get(topUserId) ?? 0 } : null
    }
  };
}

// 给 admin collection panel 用的 filter 选项(部门列表 + 用户列表)
export async function listAdminCollectionFilterOptions(): Promise<{
  departments: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
}> {
  const supabase = getServerClient();
  const [depts, users] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("users").select("id, name").order("name")
  ]);
  return {
    departments: (depts.data ?? []) as Array<{ id: string; name: string }>,
    users: (users.data ?? []) as Array<{ id: string; name: string }>
  };
}

// V1.7 admin 任务记录查询(全员)
// 支持多维筛选 + 关键字 + 分页;join users + departments 显示用户名/部门名
export type AdminTaskRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  department_name: string | null;
  type: "image" | "video";
  status: string;
  prompt: string;
  ratio: string;
  duration_seconds: number | null;
  model_name: string;
  purpose_tag_name: string;
  credits_cost: number | null;
  cost_cny: number | null;
  created_at: string;
};

export type AdminTaskFilters = {
  type?: "image" | "video";
  status?: string;
  department_id?: string;
  user_id?: string;
  model_name?: string;
  purpose_tag_name?: string;
  search?: string; // 在 prompt 中模糊查
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
};

export async function listAllTasksForAdmin(filters: AdminTaskFilters): Promise<{
  rows: AdminTaskRow[];
  total: number;
  page: number;
  page_size: number;
}> {
  const supabase = getServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.page_size ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // ⚠️ generation_tasks.department_id 是快照字段没声明 FK(决策 3.2),不能 Supabase 嵌套
  // 关联查 departments。只 join users(users.department_id 有 FK),部门名单独查并 merge
  let query = supabase
    .from("generation_tasks")
    .select(
      "id, user_id, type, status, prompt, ratio, duration_seconds, model_name, purpose_tag_name, credits_cost, cost_cny, created_at, department_id, users!user_id(name, email)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.department_id) query = query.eq("department_id", filters.department_id);
  if (filters.user_id) query = query.eq("user_id", filters.user_id);
  if (filters.model_name) query = query.eq("model_name", filters.model_name);
  if (filters.purpose_tag_name) query = query.eq("purpose_tag_name", filters.purpose_tag_name);
  if (filters.date_from) query = query.gte("created_at", filters.date_from);
  if (filters.date_to) query = query.lte("created_at", filters.date_to);
  if (filters.search && filters.search.trim()) {
    query = query.ilike("prompt", `%${filters.search.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  type Raw = {
    id: string;
    user_id: string;
    department_id: string | null;
    type: "image" | "video";
    status: string;
    prompt: string;
    ratio: string;
    duration_seconds: number | null;
    model_name: string;
    purpose_tag_name: string;
    credits_cost: number | string | null;
    cost_cny: number | string | null;
    created_at: string;
    users: { name: string; email: string } | { name: string; email: string }[] | null;
  };

  // 拿 distinct department_ids 单独查部门名(generation_tasks.department_id 是快照无 FK)
  const rawRows = (data ?? []) as Raw[];
  const deptIds = Array.from(new Set(rawRows.map(r => r.department_id).filter((x): x is string => !!x)));
  let deptMap = new Map<string, string>();
  if (deptIds.length > 0) {
    const { data: depts } = await supabase.from("departments").select("id, name").in("id", deptIds);
    for (const d of (depts ?? []) as Array<{ id: string; name: string }>) {
      deptMap.set(d.id, d.name);
    }
  }

  const rows: AdminTaskRow[] = rawRows.map(r => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      user_id: r.user_id,
      user_name: u?.name ?? "(已注销)",
      user_email: u?.email ?? "",
      department_name: r.department_id ? (deptMap.get(r.department_id) ?? null) : null,
      type: r.type,
      status: r.status,
      prompt: r.prompt,
      ratio: r.ratio,
      duration_seconds: r.duration_seconds,
      model_name: r.model_name,
      purpose_tag_name: r.purpose_tag_name,
      credits_cost: r.credits_cost == null ? null : Number(r.credits_cost),
      cost_cny: r.cost_cny == null ? null : Number(r.cost_cny),
      created_at: r.created_at
    };
  });

  return { rows, total: count ?? 0, page, page_size: pageSize };
}

// 列出 admin 任务查询所需的 filter 选项(从已有数据 distinct;无数据时返默认 4 部门 + 6 标签)
export async function listAdminTaskFilterOptions(): Promise<{
  departments: Array<{ id: string; name: string }>;
  models: string[];
  purposes: string[];
}> {
  const supabase = getServerClient();
  const [depts, modelRows, tagRows] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("models").select("name").eq("enabled", true).order("name"),
    supabase.from("purpose_tags").select("name").is("merged_into_id", null).order("sort_order")
  ]);
  return {
    departments: ((depts.data ?? []) as Array<{ id: string; name: string }>),
    models: ((modelRows.data ?? []) as Array<{ name: string }>).map(r => r.name),
    purposes: ((tagRows.data ?? []) as Array<{ name: string }>).map(r => r.name)
  };
}

// 取单个 task 含 user_id / file_path,用于鉴权 + 显示
export async function getTaskWithResult(taskId: string): Promise<{
  task: {
    id: string;
    user_id: string;
    status: string;
    type: string;
    model_name: string;
    prompt: string;
    ratio: string;
    purpose_tag_name: string;
    credits_cost: number | null;
    error_message: string | null;
    created_at: string;
  };
  result_file: { file_path: string; file_type: string } | null;
} | null> {
  const supabase = getServerClient();
  const { data: task, error: te } = await supabase
    .from("generation_tasks")
    .select("id, user_id, status, type, model_name, prompt, ratio, purpose_tag_name, credits_cost, error_message, created_at")
    .eq("id", taskId)
    .maybeSingle();
  if (te || !task) return null;

  const { data: results } = await supabase
    .from("generation_results")
    .select("file_path, file_type")
    .eq("task_id", taskId)
    .limit(1);

  return {
    task: task as never,
    result_file: results?.[0] ?? null
  };
}

// ═══ V1 加 B 完整版会话化(2026-05-29 设计参考 §3.1 + §4.1.1) ═══════════
// conversations 表 CRUD + 关联 task 查询。所有 helper 都校验 user_id 边界。
// 软删:deleted_at 置值,API/UI 自动过滤。is_default(系统"默认创作")不可删/不可改名。

export type ConversationRow = {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  pinned_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  primary_purpose_tag_id: string | null; // 024 · M5 D16 DM5.9:会话主标签;NULL=未选,blocking 不能 submit
};

// 列出该 user 的全部 conversations(置顶在前,组内 pinned_at 倒序;非置顶按 updated_at 倒序)
// 软删的不返回。
// 2026-05-29 V1 加 B:**非默认会话必须至少有 1 个 task** 才出现(避免 +新对话 创建空 conv 立即显示)
// is_default 永远保留(系统兜底创作)
export async function listUserConversations(userId: string): Promise<ConversationRow[]> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, user_id, name, is_default, pinned_at, deleted_at, created_at, updated_at, primary_purpose_tag_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as ConversationRow[];
  if (rows.length === 0) return rows;

  const nonDefaultIds = rows.filter(c => !c.is_default).map(c => c.id);
  if (nonDefaultIds.length === 0) return rows;

  const { data: taskConvs } = await supabase
    .from("generation_tasks")
    .select("conversation_id")
    .eq("user_id", userId)
    .in("conversation_id", nonDefaultIds);
  const hasTaskSet = new Set<string>();
  for (const t of taskConvs ?? []) {
    if (t.conversation_id) hasTaskSet.add(t.conversation_id);
  }
  return rows.filter(c => c.is_default || hasTaskSet.has(c.id));
}

// 取每个 conversation 的封面图(最新一张 succeeded task 的 output_index=0 file_path)
// 返回 Map<conversation_id, file_path | null>;无 task 的 conv 不在 Map 里(调用方 ?? null)
// 实现:1) 查 user 在 convIds 内的所有 succeeded task,按 created_at desc;
//      2) in-memory group by conversation_id 取 first(= latest);
//      3) 一次查 generation_results 拿这些 task_id 的 output_index=0 file_path
export async function getConversationCoverPaths(
  userId: string,
  conversationIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (conversationIds.length === 0) return result;

  const supabase = getServerClient();
  const { data: tasks } = await supabase
    .from("generation_tasks")
    .select("id, conversation_id, created_at")
    .eq("user_id", userId)
    .eq("status", "succeeded")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  const latestTaskByConv = new Map<string, string>();
  for (const t of tasks ?? []) {
    if (!t.conversation_id) continue;
    if (!latestTaskByConv.has(t.conversation_id)) {
      latestTaskByConv.set(t.conversation_id, t.id);
    }
  }
  if (latestTaskByConv.size === 0) return result;

  const taskIds = Array.from(latestTaskByConv.values());
  const { data: outs } = await supabase
    .from("generation_results")
    .select("task_id, file_path")
    .in("task_id", taskIds)
    .eq("output_index", 0);

  const pathByTask = new Map<string, string>(
    (outs ?? []).map(o => [o.task_id, o.file_path])
  );
  for (const [convId, taskId] of latestTaskByConv.entries()) {
    const path = pathByTask.get(taskId);
    if (path) result.set(convId, path);
  }
  return result;
}

// 创建新 conversation(name 默认空字符串,首次 task 完成后回填 prompt 前 18 字)
// is_default=FALSE(系统默认会话由 ensureDefaultConversation 创建)
export async function createConversation(userId: string, name = ""): Promise<ConversationRow> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, name, is_default: false })
    .select("id, user_id, name, is_default, pinned_at, deleted_at, created_at, updated_at, primary_purpose_tag_id")
    .single();
  if (error || !data) throw error ?? new Error("createConversation failed");
  return data as ConversationRow;
}

// 重命名(空 name 被拒;is_default 不可改名 — 数据层兜底,API 层也要校验)
export async function renameConversation(
  id: string,
  userId: string,
  name: string
): Promise<ConversationRow | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_default", false)
    .is("deleted_at", null)
    .select("id, user_id, name, is_default, pinned_at, deleted_at, created_at, updated_at, primary_purpose_tag_id")
    .maybeSingle();
  if (error) throw error;
  return (data as ConversationRow | null) ?? null;
}

// 置顶 / 取消置顶(is_default 不允许置顶 — 默认创作永远在底部按 updated_at 排)
export async function pinConversation(
  id: string,
  userId: string,
  pinned: boolean
): Promise<ConversationRow | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({
      pinned_at: pinned ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_default", false)
    .is("deleted_at", null)
    .select("id, user_id, name, is_default, pinned_at, deleted_at, created_at, updated_at, primary_purpose_tag_id")
    .maybeSingle();
  if (error) throw error;
  return (data as ConversationRow | null) ?? null;
}

// 软删(is_default 不可删 — 数据层兜底);关联 task 不动,仍在 /assets 可查
export async function softDeleteConversation(
  id: string,
  userId: string
): Promise<boolean> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_default", false)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

// 确保 user 有"默认创作"会话 — 没有就创建,返回该 conversation。
// 调用时机:user 进生成页且无 ?conversation_id query → 回退到默认会话
// migration 021 已为有历史 task 的 user 创建过,这里兜底新 user(首次访问)
export async function ensureDefaultConversation(userId: string): Promise<ConversationRow> {
  const supabase = getServerClient();
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, user_id, name, is_default, pinned_at, deleted_at, created_at, updated_at, primary_purpose_tag_id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return existing as ConversationRow;

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, name: "默认创作", is_default: true })
    .select("id, user_id, name, is_default, pinned_at, deleted_at, created_at, updated_at, primary_purpose_tag_id")
    .single();
  if (error || !data) throw error ?? new Error("ensureDefaultConversation failed");
  return data as ConversationRow;
}

// 列出当前 conversation 下全部 task(feed 加载用 — 不像 listUserTasks 限制 succeeded)
// 含 queued/running 用于 skeleton 显示;按 created_at 升序(feed 最早在上,最新在下)
// 返回值扩展 reference_image_url(generation_tasks 表字段,生成页 feed 卡需要展示参考图小预览)
export async function listTasksByConversation(
  userId: string,
  conversationId: string
): Promise<(HistoryItemWithOutputs & { reference_image_url: string | null })[]> {
  const supabase = getServerClient();
  const { data: tasks, error } = await supabase
    .from("generation_tasks")
    .select(
      "id, type, status, prompt, ratio, duration_seconds, model_name, purpose_tag_name, credits_cost, created_at, reference_image_url"
    )
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const taskIds = (tasks ?? []).map(t => t.id);
  const outputsMap = new Map<string, TaskOutputLite[]>();
  if (taskIds.length > 0) {
    const { data: results } = await supabase
      .from("generation_results")
      .select("task_id, file_path, file_type, width, height, output_index")
      .in("task_id", taskIds)
      .order("output_index", { ascending: true });
    for (const r of results ?? []) {
      const arr = outputsMap.get(r.task_id) ?? [];
      arr.push({
        output_index: r.output_index ?? 0,
        file_path: r.file_path,
        file_type: r.file_type,
        width: r.width ?? null,
        height: r.height ?? null
      });
      outputsMap.set(r.task_id, arr);
    }
  }

  return (tasks ?? []).map(t => {
    const outs = outputsMap.get(t.id) ?? [];
    return {
      id: t.id,
      type: t.type,
      status: t.status,
      prompt: t.prompt,
      ratio: t.ratio,
      duration_seconds: t.duration_seconds,
      model_name: t.model_name,
      purpose_tag_name: t.purpose_tag_name,
      credits_cost: t.credits_cost,
      created_at: t.created_at,
      result_file_path: outs[0]?.file_path ?? null,
      result_file_type: outs[0]?.file_type ?? null,
      outputs: outs,
      reference_image_url: (t as { reference_image_url?: string | null }).reference_image_url ?? null
    } as HistoryItemWithOutputs & { reference_image_url: string | null };
  });
}

// 校验 conversation 属于 user 且未软删(API 层/generate 路由调用前校验)
export async function getConversationForUser(
  id: string,
  userId: string
): Promise<ConversationRow | null> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, user_id, name, is_default, pinned_at, deleted_at, created_at, updated_at, primary_purpose_tag_id")
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as ConversationRow | null) ?? null;
}

// 024 · M5 P1 波 2:设置 conversation 主标签
// purposeTagId=null 表示清空主标签(UI 暂不暴露,留 fail-safe)
// caller 应先用 isActivePurposeTag 校验非 null 的 tagId
// 返回 null = conv 不存在 / 已软删
// 注意:**默认创作允许改主标签**(跟 rename/pin 不同;主标签是 5 必选的一部分,默认创作员工也得选)
export async function setConversationPrimaryTag(
  id: string,
  userId: string,
  purposeTagId: string | null
): Promise<ConversationRow | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ primary_purpose_tag_id: purposeTagId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id, user_id, name, is_default, pinned_at, deleted_at, created_at, updated_at, primary_purpose_tag_id")
    .maybeSingle();
  if (error) throw error;
  return (data as ConversationRow | null) ?? null;
}

// 视频/异步路径用:只知 taskId 不知 conversation_id + prompt,查表后转发到 bumpConversationOnTask
export async function bumpConversationByTaskId(
  taskId: string,
  userId: string
): Promise<void> {
  const supabase = getServerClient();
  const { data: t } = await supabase
    .from("generation_tasks")
    .select("conversation_id, prompt")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!t || !t.conversation_id) return;
  await bumpConversationOnTask(t.conversation_id, userId, t.prompt);
}

// generate 路由用:首次 task 写入完成时,若 conversation.name 为空,回填 prompt 前 18 字
// Unicode 安全(Array.from 按 code point 切分)
// 同时刷新 updated_at — 让该 conv 在 panel 排到最前
export async function bumpConversationOnTask(
  conversationId: string,
  userId: string,
  prompt: string
): Promise<void> {
  const supabase = getServerClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("name")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conv) return;

  const updates: { updated_at: string; name?: string } = {
    updated_at: new Date().toISOString()
  };
  if (!conv.name) {
    const chars = Array.from(prompt.replace(/\s+/g, " ").trim());
    const truncated = chars.slice(0, 18).join("");
    updates.name = chars.length > 18 ? `${truncated}…` : truncated || "未命名";
  }
  await supabase
    .from("conversations")
    .update(updates)
    .eq("id", conversationId)
    .eq("user_id", userId);
}
