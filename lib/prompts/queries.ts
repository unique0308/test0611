// V1.1 Prompt 收藏模块 - DB 查询层
// 业务代码不要直接 import 本文件,走 @/lib/prompts 统一出口

import { getServerClient } from "@/lib/supabase/server";
import type {
  PromptCollection,
  ListCollectionsFilters,
  ListCollectionsResult
} from "./types";

const MAX_PER_USER = 200; // Q-V1-01 已答:个人 200 条上限

export class PromptCollectionLimitReachedError extends Error {
  constructor() {
    super("user has reached 200 prompt collection cap");
    this.name = "PromptCollectionLimitReachedError";
  }
}

export class TaskNotFoundError extends Error {
  constructor() {
    super("task not found or not owned by user");
    this.name = "TaskNotFoundError";
  }
}

// ─── 创建收藏(从 generation_tasks 快照)──────────────────────────────────
// 幂等语义:同 user_id + task_id 已存在时返回已有记录,不报错
// 真值来源:generation_tasks(prompt / model_name / type / ratio / duration_seconds
//   / purpose_tag_name / reference_image_url 全部快照存)
export async function collectFromTask(args: {
  user_id: string;
  task_id: string;
  output_index?: number; // 2026-05-22:单张收藏粒度,默认 0
}): Promise<PromptCollection> {
  const supabase = getServerClient();
  const outputIndex = args.output_index ?? 0;

  // 1. 幂等:先看有没有(同 user + task + output)
  const { data: existing } = await supabase
    .from("prompt_collections")
    .select("*")
    .eq("user_id", args.user_id)
    .eq("task_id", args.task_id)
    .eq("output_index", outputIndex)
    .maybeSingle();
  if (existing) return existing as PromptCollection;

  // 2. 上限校验(决策 Q-V1-01:个人 200 条)
  const { count } = await supabase
    .from("prompt_collections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.user_id);
  if ((count ?? 0) >= MAX_PER_USER) {
    throw new PromptCollectionLimitReachedError();
  }

  // 3. 读 generation_tasks 取快照(并校验任务属当前用户)
  const { data: task } = await supabase
    .from("generation_tasks")
    .select(
      "id, user_id, type, prompt, ratio, duration_seconds, model_name, purpose_tag_name, reference_image_url"
    )
    .eq("id", args.task_id)
    .maybeSingle();
  if (!task) throw new TaskNotFoundError();
  if ((task as { user_id: string }).user_id !== args.user_id) {
    // 安全侧:不暴露"是否他人任务"差异,统一抛 not found
    throw new TaskNotFoundError();
  }

  const t = task as {
    type: "image" | "video";
    prompt: string;
    ratio: string;
    duration_seconds: number | null;
    model_name: string;
    purpose_tag_name: string | null;
    reference_image_url: string | null;
  };

  // ratio_or_duration:图片存比例(3:4),视频存时长(5s)
  const ratioOrDuration =
    t.type === "video" && t.duration_seconds != null
      ? `${t.duration_seconds}s`
      : t.ratio;

  // 默认 title:prompt 前 30 字符
  const title = t.prompt.slice(0, 30);

  // 4. INSERT(若 race condition 并发 INSERT 撞唯一索引,catch 23505 再查回退)
  const { data: inserted, error } = await supabase
    .from("prompt_collections")
    .insert({
      user_id: args.user_id,
      task_id: args.task_id,
      output_index: outputIndex,
      prompt_text: t.prompt,
      model_name: t.model_name,
      kind: t.type,
      ratio_or_duration: ratioOrDuration,
      reference_image_url: t.reference_image_url,
      purpose_tag_name: t.purpose_tag_name,
      title,
      tags: null
    })
    .select("*")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      // 并发撞索引:再查一遍返回已有
      const { data: again } = await supabase
        .from("prompt_collections")
        .select("*")
        .eq("user_id", args.user_id)
        .eq("task_id", args.task_id)
        .eq("output_index", outputIndex)
        .maybeSingle();
      if (again) return again as PromptCollection;
    }
    throw error;
  }

  return inserted as PromptCollection;
}

// ─── 批量收藏(资产页批量操作)──────────────────────────────────────────────
// 逐项收藏(collectFromTask 幂等);命中 200 条上限即停止并回报
export async function collectFromTasksBatch(args: {
  user_id: string;
  items: Array<{ task_id: string; output_index: number }>;
}): Promise<{ collected: number; limitReached: boolean }> {
  let collected = 0;
  for (const it of args.items) {
    try {
      await collectFromTask({
        user_id: args.user_id,
        task_id: it.task_id,
        output_index: it.output_index
      });
      collected += 1;
    } catch (e) {
      if (e instanceof PromptCollectionLimitReachedError) {
        return { collected, limitReached: true };
      }
      if (e instanceof TaskNotFoundError) continue; // 无效项跳过
      throw e;
    }
  }
  return { collected, limitReached: false };
}

// ─── 删除收藏(取消)─────────────────────────────────────────────────────
// 只能删自己的;返回 true 表示有行被删,false 表示 not found(404)
export async function uncollect(args: {
  user_id: string;
  collection_id: number;
}): Promise<boolean> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("prompt_collections")
    .delete()
    .eq("id", args.collection_id)
    .eq("user_id", args.user_id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// ─── 列表 ─────────────────────────────────────────────────────────────────
export async function listUserCollections(
  filters: ListCollectionsFilters
): Promise<ListCollectionsResult> {
  const supabase = getServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.page_size ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("prompt_collections")
    .select("*", { count: "exact" })
    .eq("user_id", filters.user_id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.tag) query = query.ilike("tags", `%${filters.tag}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    rows: (data ?? []) as PromptCollection[],
    total: count ?? 0,
    page,
    page_size: pageSize
  };
}

// ─── 单条详情(用于"使用此 Prompt"复用)────────────────────────────────
export async function getUserCollection(args: {
  user_id: string;
  collection_id: number;
}): Promise<PromptCollection | null> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("prompt_collections")
    .select("*")
    .eq("id", args.collection_id)
    .eq("user_id", args.user_id)
    .maybeSingle();
  return (data as PromptCollection | null) ?? null;
}

// ─── 修改 title / tags / prompt_text(只允许改自己的)──────────────────────
export async function patchCollection(args: {
  user_id: string;
  collection_id: number;
  title?: string;
  tags?: string | null;
  prompt_text?: string;
}): Promise<PromptCollection | null> {
  const supabase = getServerClient();
  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) patch.title = args.title;
  if (args.tags !== undefined) patch.tags = args.tags;
  if (args.prompt_text !== undefined) patch.prompt_text = args.prompt_text;
  if (Object.keys(patch).length === 0) {
    // 无字段变更,直接返回当前行
    return getUserCollection({ user_id: args.user_id, collection_id: args.collection_id });
  }
  const { data, error } = await supabase
    .from("prompt_collections")
    .update(patch)
    .eq("id", args.collection_id)
    .eq("user_id", args.user_id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as PromptCollection | null) ?? null;
}

// ─── 给资产页用:批量查 收藏映射 ───────────────────────────────────────────
// 收藏粒度到单张产物,key = `${task_id}:${output_index}`
export type CollectionLite = { id: number; tags: string | null };

export async function getCollectionMapForTasks(args: {
  user_id: string;
  task_ids: string[];
}): Promise<Map<string, CollectionLite>> {
  if (args.task_ids.length === 0) return new Map();
  const supabase = getServerClient();
  const { data } = await supabase
    .from("prompt_collections")
    .select("id, task_id, output_index, tags")
    .eq("user_id", args.user_id)
    .in("task_id", args.task_ids);
  const m = new Map<string, CollectionLite>();
  for (const r of (data ?? []) as Array<{
    id: number;
    task_id: string | null;
    output_index: number;
    tags: string | null;
  }>) {
    if (r.task_id) m.set(`${r.task_id}:${r.output_index}`, { id: r.id, tags: r.tags });
  }
  return m;
}

// ─── 用户用过的全部标签(去重排序)— 历史页 / 收藏页标签分组下拉用 ──────────
export async function getUserCollectionTags(userId: string): Promise<string[]> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("prompt_collections")
    .select("tags")
    .eq("user_id", userId);
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ tags: string | null }>) {
    for (const t of (r.tags ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
      set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh"));
}
