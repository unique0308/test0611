import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "./admin-check";
import type { User } from "@/lib/types/user";

// AUTH_MODE=mock 时的实现
// 业务代码不要直接 import 这个文件,走 @/lib/auth 统一出口
// 切换流程:见 ../MVP跟踪文档/后期补全清单.md 第 1 节

const COOKIE_NAME = "auth_mock_user_id";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 天

export async function getCurrentUser(): Promise<User | null> {
  const userId = cookies().get(COOKIE_NAME)?.value;
  if (!userId) return null;

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, name, department_id, is_dept_manager, managed_department_ids, feishu_user_id, avatar_url, monthly_quota_credits, created_at, departments(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  // Supabase TS 把关联查询推断为数组,运行时可能是对象或数组,统一处理
  const raw = data as unknown as {
    id: string;
    email: string;
    name: string;
    department_id: string | null;
    is_dept_manager: boolean | null;
    managed_department_ids: string[] | null;
    feishu_user_id: string | null;
    avatar_url: string | null;
    monthly_quota_credits: number | null;
    created_at: string;
    departments: { name: string } | { name: string }[] | null;
  };
  const dept = Array.isArray(raw.departments) ? raw.departments[0] : raw.departments;

  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    department_id: raw.department_id,
    department_name: dept?.name ?? null,
    is_admin: isAdminEmail(raw.email),
    is_dept_manager: raw.is_dept_manager ?? false,
    managed_department_ids: raw.managed_department_ids ?? [],
    feishu_user_id: raw.feishu_user_id ?? null,
    avatar_url: raw.avatar_url ?? null,
    // monthly_quota_credits 默认 5000(migration 017 已设默认值,这里只是双保险)
    monthly_quota_credits: raw.monthly_quota_credits ?? 5000,
    created_at: raw.created_at
  };
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/dev");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireAuth();
  if (!user.is_admin) redirect("/?forbidden=1");
  return user;
}

// V1.5 部门负责人中间件
// admin 也允许通过(superset);否则要求 manager 且 deptId 在 managed_department_ids 内
// V1 单部门:实际只用 managed_department_ids[0],array contains 等价
export async function requireManagerOfDept(deptId: string): Promise<User> {
  const user = await requireAuth();
  if (user.is_admin) return user; // admin 自动通过
  if (!user.is_dept_manager) redirect("/?forbidden=manager");
  if (!user.managed_department_ids.includes(deptId)) {
    redirect("/?forbidden=manager_dept");
  }
  return user;
}

export async function logout(): Promise<void> {
  cookies().delete(COOKIE_NAME);
}

// 内部函数:仅 /api/auth/dev/switch 路由使用
export function _setMockSession(userId: string) {
  cookies().set(COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    // 开发期 localhost http,secure 不开
    secure: process.env.NODE_ENV === "production"
  });
}
