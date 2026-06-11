// V1.2 / V1.3 / V1.4 工具报销模块 - 类型层
// 仅 re-export `@/lib/types/v1`,业务代码不直接深 import

export type {
  ReimbursementStatus,
  ReimbursementPaymentType,
  ReimbursementToolPreset,
  ReimbursementRequest,
  ReimbursementCreateInput,
  ReimbursementReviewInput
} from "@/lib/types/v1";

// 列表筛选(员工查自己 / admin 查全部走同一个 query,scope 由 user.is_admin 决定)
export type ListReimbursementsFilters = {
  user_id: string;
  is_admin: boolean;
  status?: "pending" | "approved" | "rejected";
  page?: number;
  page_size?: number;
};

export type ListReimbursementsResult = {
  rows: import("@/lib/types/v1").ReimbursementRequest[];
  total: number;
  page: number;
  page_size: number;
};

// 员工 sub tab summary 4 卡数据(本年累计 / 审核中 / 本月已通过 / 本月已驳回)
export type ReimbursementSummary = {
  year_total_cny: number;
  year_count: number;
  pending_count: number;
  pending_cny: number;
  month_approved_count: number;
  month_approved_cny: number;
  month_rejected_count: number;
};
