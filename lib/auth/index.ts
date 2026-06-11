// 业务代码 import 的唯一入口
// AUTH_MODE 切换由本文件决定,业务代码透明无感
// CLAUDE.md 第 4.1 节铁律:绝不直接 import mock-login / feishu-oauth

import * as mock from "./mock-login";
import * as real from "./feishu-oauth";

const useReal = process.env.AUTH_MODE === "real";
const impl = useReal ? real : mock;

export const getCurrentUser = impl.getCurrentUser;
export const requireAuth = impl.requireAuth;
export const requireAdmin = impl.requireAdmin;
export const requireManagerOfDept = impl.requireManagerOfDept; // V1.5
export const logout = impl.logout;

export { isAdminEmail } from "./admin-check";
export type { User } from "@/lib/types/user";

// V1.5 工具函数:user 是否管这个 dept(admin 也算 true,superset)
// 不走 redirect 的纯检查,API route 内部权限分支用
export function doesUserManageDept(user: { is_admin: boolean; is_dept_manager: boolean; managed_department_ids: string[] }, deptId: string): boolean {
  if (user.is_admin) return true;
  if (!user.is_dept_manager) return false;
  return user.managed_department_ids.includes(deptId);
}
