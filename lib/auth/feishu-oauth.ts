import type { User } from "@/lib/types/user";

// AUTH_MODE=real 时的实现骨架
// MVP 阶段函数体全部 throw,切换流程见 ../MVP跟踪文档/后期补全清单.md 第 1 节
// 真实端点见 ../MVP跟踪文档/技术跟踪.md 第 4.1 节(由 Week 0 实测确认)

const TODO = "TODO: integrate when feishu app approved (见 LOCAL_SECRETS.md 第 3 节)";

export async function getCurrentUser(): Promise<User | null> {
  throw new Error(TODO);
}

export async function requireAuth(): Promise<User> {
  throw new Error(TODO);
}

export async function requireAdmin(): Promise<User> {
  throw new Error(TODO);
}

// V1.5 部门负责人中间件骨架(切真实时实现)
export async function requireManagerOfDept(_deptId: string): Promise<User> {
  throw new Error(TODO);
}

export async function logout(): Promise<void> {
  throw new Error(TODO);
}

// 真实 OAuth 流程函数(切换时填实)
export async function feishuLogin(_code: string): Promise<{ accessToken: string; openId: string }> {
  throw new Error(TODO);
}

export async function getFeishuUserInfo(_accessToken: string): Promise<{
  open_id: string;
  email: string;
  name: string;
  avatar_url: string;
  department_ids: string[];
}> {
  throw new Error(TODO);
}

export async function getFeishuDepartments(): Promise<
  Array<{ open_department_id: string; name: string; parent_department_id: string | null }>
> {
  throw new Error(TODO);
}
