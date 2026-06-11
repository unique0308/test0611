export type User = {
  id: string;
  email: string;
  name: string;
  department_id: string | null;
  department_name: string | null;
  is_admin: boolean;
  // V1.5 部门负责人(Q-V1-12:V1 单部门,managed_department_ids 用数组留 V2 多对多扩展)
  is_dept_manager: boolean;
  managed_department_ids: string[]; // UUID[]
  feishu_user_id: string | null;
  avatar_url: string | null;
  // V1 Day 44(决策 5 修订):个人月配额,默认 5000;部门负责人后续可按人调整(UI 留 V1.x)
  monthly_quota_credits: number;
  // V1 Day 44:加入时间(用于个人中心 Profile Header meta 第三项,展示"加入于 YYYY-MM")
  created_at: string;
};
