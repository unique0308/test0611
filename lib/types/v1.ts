// V1 完整形态类型定义
// 设计依据:
//   - ../MVP跟踪文档/技术跟踪.md §7 Week 4 任务 4.2
//   - ../MVP跟踪文档/产品跟踪.md §3.2 V1.1 / V1.2 / V1.3 / V1.4
//   - migration 007_v1_schema.sql / 008_v1_seed.sql
//
// V1.5 部门负责人字段(is_dept_manager / managed_department_ids)Week 5 才加,
// 届时在 lib/types/user.ts 扩展 User,本文件不冗余定义。

// ─── V1.1 Prompt 收藏 ────────────────────────────────────────────────────────

export type GenerationKind = "image" | "video";

export type PromptCollection = {
  id: number;
  user_id: string;
  task_id: string | null;
  output_index: number; // 2026-05-22:收藏粒度到单张产物,默认 0
  prompt_text: string;
  model_name: string;
  kind: GenerationKind;
  ratio_or_duration: string | null;
  reference_image_url: string | null;
  purpose_tag_name: string | null;
  title: string;
  tags: string | null;
  created_at: string;
};

// 收藏入口:task_id + 产物下标(单张收藏);服务端读 generation_tasks 取快照
export type PromptCollectionCreateInput = {
  task_id: string;
  output_index?: number; // 默认 0
};

// 收藏编辑:允许改 title / tags / prompt_text(2026-05-22:详情弹层支持改提示词)
export type PromptCollectionPatchInput = {
  title?: string;
  tags?: string | null;
  prompt_text?: string;
};

// ─── V1.2 / V1.3 / V1.4 工具报销 ────────────────────────────────────────────

// 决策 14 D2:3 状态系统,不含 draft / paid
export type ReimbursementStatus = "pending" | "approved" | "rejected";

// 决策 14 D2:5 选项对齐设计参考 §4.2.4 表单
export type ReimbursementPaymentType =
  | "monthly"      // 月度订阅
  | "annual"       // 年度订阅
  | "api_topup"    // API 充值
  | "one_time"     // 一次性
  | "plugin";      // 插件

export type ReimbursementToolPreset = {
  id: number;
  name: string;
  category: string | null;
  enabled: boolean;
  sort_order: number;
};

export type ReimbursementRequest = {
  id: number;
  request_number: string;       // R-0001 zero-padded,DB trigger 自动填
  user_id: string;
  department_id: string;
  tool_name: string;            // 从 presets 选名字快照存
  amount_cny: number;           // numeric(10,2),Postgres 返回字符串,应用层 parseFloat
  usage_period_start: string;   // YYYY-MM-DD
  usage_period_end: string;
  purpose_description: string;
  attachment_urls: string[];    // "storage://..." 引用数组
  payment_type: ReimbursementPaymentType;
  status: ReimbursementStatus;
  reviewer_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
};

// 提交申请的 form payload
// amount_cny 上限 ¥2000 应用层 zod 校验,见技术跟踪 §7 Week 4 任务 4.5
export type ReimbursementCreateInput = {
  tool_name: string;
  amount_cny: number;
  usage_period_start: string;
  usage_period_end: string;
  purpose_description: string;
  payment_type: ReimbursementPaymentType;
  // attachment_urls 不在 form 里,由 multipart/form-data 上传后端转 storage:// 引用
};

// admin 审核 action
export type ReimbursementReviewInput =
  | { action: "approve"; comment?: string }
  | { action: "reject"; comment: string };  // 驳回必须填 comment

// ─── V1 audit_logs 新增动作枚举 ─────────────────────────────────────────────

// 跟技术跟踪 §3.2 (6) 同步;audit_logs.action 在 DB 层是 text 不是 enum,
// 加新动作不需要 migration,但要在这里保持 TS 字面量校验
export type V1AuditAction =
  | "prompt_collect"
  | "prompt_uncollect"
  | "prompt_reuse"
  | "reimbursement_submit"
  | "reimbursement_approve"
  | "reimbursement_reject"
  | "admin_review_reimbursement"  // 审核 PATCH 接口统一动作,跟 approve/reject 并列
  | "tasks_batch_download"        // V1.15 D9 决定加
  | "manager_view_dashboard"      // V1.5 manager 看本部门看板
  | "manager_quota_adjust"        // V1.5 manager 调整本部门月配额
  | "admin_query_task"            // V1.7 admin 任务记录查询(含 CSV 导出,metadata.export 区分)
  | "admin_view_collections"      // V1.8 admin Prompt 收藏监控
  | "purpose_tag_create"          // V1.12 员工新增使用目的
  | "admin_merge_purpose_tags"    // V1.12 admin 合并使用目的
  | "admin_view_manage";          // Day 45 admin 进入管理面板 /manage
