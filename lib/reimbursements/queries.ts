// V1.2 / V1.3 / V1.4 报销模块 - DB 查询层
// 业务代码不要直接 import 本文件,走 @/lib/reimbursements 统一出口
//
// 设计要点:
//   - 单笔上限 ¥2000 校验在应用层(Q-V1-03),不放 DB CHECK 便于 V2 提额
//   - department_id 存快照(员工换部门后老报销仍归原部门统计)
//   - tool_name 存名字快照(预设软下架后老申请仍可读)
//   - amount_cny Postgres NUMERIC 经 pg 包默认返字符串,这里 Number(...) 转 number
//   - request_number 由 DB trigger 自动填 R-{4 位 zero-padded}
//   - admin 跨用户读:由 Route Handler 的 user.is_admin 决定,query 层透传 scope

import { getServerClient } from "@/lib/supabase/server";
import type {
  ReimbursementRequest,
  ReimbursementToolPreset,
  ReimbursementCreateInput,
  ReimbursementStatus,
  ListReimbursementsFilters,
  ListReimbursementsResult,
  ReimbursementSummary
} from "./types";

export const SINGLE_LIMIT_CNY = 2000;
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

export class AmountExceedsLimitError extends Error {
  constructor() {
    super(`amount exceeds single-submit limit of ¥${SINGLE_LIMIT_CNY}`);
    this.name = "AmountExceedsLimitError";
  }
}

export class ReimbursementNotFoundError extends Error {
  constructor() {
    super("reimbursement request not found");
    this.name = "ReimbursementNotFoundError";
  }
}

export class ReimbursementAlreadyReviewedError extends Error {
  constructor() {
    super("reimbursement request is not pending");
    this.name = "ReimbursementAlreadyReviewedError";
  }
}

// ─── 工具预设(申请表单下拉)──────────────────────────────────────────────
export async function listEnabledToolPresets(): Promise<ReimbursementToolPreset[]> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("reimbursement_tool_presets")
    .select("id, name, category, enabled, sort_order")
    .eq("enabled", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ReimbursementToolPreset[];
}

// ─── 创建申请 ────────────────────────────────────────────────────────────
// department_id 从 users.department_id 快照(空时拒绝)
// attachment_urls 由 Route Handler 用 lib/storage.uploadFile 写盘后传进来
export async function createRequest(args: {
  user_id: string;
  department_id: string;
  attachment_paths: string[];
  input: ReimbursementCreateInput;
}): Promise<ReimbursementRequest> {
  if (args.input.amount_cny > SINGLE_LIMIT_CNY) {
    throw new AmountExceedsLimitError();
  }
  if (args.input.amount_cny <= 0) {
    throw new Error("amount_cny must be > 0");
  }
  if (args.input.usage_period_end < args.input.usage_period_start) {
    throw new Error("usage_period_end must be >= usage_period_start");
  }

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("reimbursement_requests")
    .insert({
      user_id: args.user_id,
      department_id: args.department_id,
      tool_name: args.input.tool_name,
      amount_cny: args.input.amount_cny,
      usage_period_start: args.input.usage_period_start,
      usage_period_end: args.input.usage_period_end,
      purpose_description: args.input.purpose_description,
      attachment_urls: args.attachment_paths,
      payment_type: args.input.payment_type,
      status: "pending"
      // request_number 由 BEFORE INSERT trigger 自动填
    })
    .select("*")
    .single();
  if (error) throw error;
  return normalize(data);
}

// ─── 列表(员工只看自己 / admin 看全部)──────────────────────────────────
export async function listRequests(
  filters: ListReimbursementsFilters
): Promise<ListReimbursementsResult> {
  const supabase = getServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.page_size ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("reimbursement_requests")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (!filters.is_admin) {
    query = query.eq("user_id", filters.user_id);
  }
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    rows: (data ?? []).map(normalize),
    total: count ?? 0,
    page,
    page_size: pageSize
  };
}

// ─── admin 列表(joined 申请人姓名 / 部门 / 邮箱,给报销审核 panel 用)─────
// 不走 listRequests:admin panel 需要展示 user-cell,join 一次省去前端 N 次查
export type ReimbursementWithUser = ReimbursementRequest & {
  user_name: string;
  user_email: string;
  user_department_name: string | null;
};

export async function listRequestsForAdmin(args: {
  status?: ReimbursementStatus;
  page?: number;
  page_size?: number;
}): Promise<{
  rows: ReimbursementWithUser[];
  total: number;
  page: number;
  page_size: number;
}> {
  const supabase = getServerClient();
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, args.page_size ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("reimbursement_requests")
    .select("*, users!user_id(name, email, departments(name))", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (args.status) query = query.eq("status", args.status);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows: ReimbursementWithUser[] = ((data ?? []) as Array<Record<string, unknown>>).map(r => {
    const userRel = r.users as { name?: string; email?: string; departments?: { name?: string } | { name?: string }[] | null } | null;
    const dept = Array.isArray(userRel?.departments) ? userRel?.departments[0] : userRel?.departments;
    return {
      ...normalize(r),
      user_name: userRel?.name ?? "(已注销)",
      user_email: userRel?.email ?? "",
      user_department_name: dept?.name ?? null
    };
  });

  return { rows, total: count ?? 0, page, page_size: pageSize };
}

// ─── 单条详情(权限:员工只看自己 / admin 看全部)────────────────────────
export async function getRequest(args: {
  id: number;
  user_id: string;
  is_admin: boolean;
}): Promise<ReimbursementRequest | null> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("reimbursement_requests")
    .select("*")
    .eq("id", args.id)
    .maybeSingle();
  if (!data) return null;
  const row = normalize(data);
  if (!args.is_admin && row.user_id !== args.user_id) return null; // 不暴露存在性
  return row;
}

// ─── 审核(admin only,只能改 pending → approved/rejected)─────────────
export async function reviewRequest(args: {
  id: number;
  reviewer_id: string;
  action: "approve" | "reject";
  comment?: string | null;
}): Promise<ReimbursementRequest> {
  if (args.action === "reject") {
    if (!args.comment || args.comment.trim().length === 0) {
      throw new Error("reject requires non-empty comment");
    }
  }
  const supabase = getServerClient();

  // 先确认 pending(防止重复审批 / 并发覆盖)
  const { data: existing } = await supabase
    .from("reimbursement_requests")
    .select("id, status")
    .eq("id", args.id)
    .maybeSingle();
  if (!existing) throw new ReimbursementNotFoundError();
  if ((existing as { status: string }).status !== "pending") {
    throw new ReimbursementAlreadyReviewedError();
  }

  const newStatus: ReimbursementStatus = args.action === "approve" ? "approved" : "rejected";
  const { data, error } = await supabase
    .from("reimbursement_requests")
    .update({
      status: newStatus,
      reviewer_id: args.reviewer_id,
      review_comment: args.comment ?? null,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", args.id)
    .eq("status", "pending") // 双重保护:并发情况下乐观锁
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ReimbursementAlreadyReviewedError();
  return normalize(data);
}

// ─── 员工 summary 4 卡(本年累计 / 审核中 / 本月已通过 / 本月已驳回)────
export async function getUserSummary(args: { user_id: string }): Promise<ReimbursementSummary> {
  const supabase = getServerClient();
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { data } = await supabase
    .from("reimbursement_requests")
    .select("amount_cny, status, created_at, reviewed_at")
    .eq("user_id", args.user_id)
    .gte("created_at", yearStart);

  const rows = ((data ?? []) as Array<{
    amount_cny: number | string;
    status: string;
    created_at: string;
    reviewed_at: string | null;
  }>).map(r => ({
    ...r,
    amount_cny: Number(r.amount_cny) || 0
  }));

  const year_total = rows.reduce((s, r) => s + r.amount_cny, 0);
  const pending = rows.filter(r => r.status === "pending");
  const month_approved = rows.filter(
    r => r.status === "approved" && r.reviewed_at && r.reviewed_at >= monthStart
  );
  const month_rejected = rows.filter(
    r => r.status === "rejected" && r.reviewed_at && r.reviewed_at >= monthStart
  );

  return {
    year_total_cny: round2(year_total),
    year_count: rows.length,
    pending_count: pending.length,
    pending_cny: round2(pending.reduce((s, r) => s + r.amount_cny, 0)),
    month_approved_count: month_approved.length,
    month_approved_cny: round2(month_approved.reduce((s, r) => s + r.amount_cny, 0)),
    month_rejected_count: month_rejected.length
  };
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────

// pg 返回 NUMERIC 为字符串,统一转 number;attachment_urls 已是 jsonb 数组直接用
function normalize(row: Record<string, unknown>): ReimbursementRequest {
  return {
    id: Number(row.id),
    request_number: row.request_number as string,
    user_id: row.user_id as string,
    department_id: row.department_id as string,
    tool_name: row.tool_name as string,
    amount_cny: Number(row.amount_cny) || 0,
    usage_period_start: row.usage_period_start as string,
    usage_period_end: row.usage_period_end as string,
    purpose_description: row.purpose_description as string,
    attachment_urls: Array.isArray(row.attachment_urls) ? (row.attachment_urls as string[]) : [],
    payment_type: row.payment_type as ReimbursementRequest["payment_type"],
    status: row.status as ReimbursementStatus,
    reviewer_id: (row.reviewer_id as string | null) ?? null,
    review_comment: (row.review_comment as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    created_at: row.created_at as string
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
