// V1.2 / V1.3 / V1.4 工具报销模块 - 业务代码唯一入口
//
// CLAUDE.md 第 4.1 节铁律:业务代码不直接 import ./queries / ./notification / ./reject-reasons
// 路径:`import { ... } from "@/lib/reimbursements"`

export {
  listEnabledToolPresets,
  createRequest,
  listRequests,
  listRequestsForAdmin,
  getRequest,
  reviewRequest,
  getUserSummary,
  AmountExceedsLimitError,
  ReimbursementNotFoundError,
  ReimbursementAlreadyReviewedError,
  SINGLE_LIMIT_CNY,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE
} from "./queries";
export type { ReimbursementWithUser } from "./queries";

export { notifyReimbursementSubmitted } from "./notification";

export { REJECT_REASON_PRESETS } from "./reject-reasons";
export type { RejectReasonPreset } from "./reject-reasons";

export type {
  ReimbursementStatus,
  ReimbursementPaymentType,
  ReimbursementToolPreset,
  ReimbursementRequest,
  ReimbursementCreateInput,
  ReimbursementReviewInput,
  ListReimbursementsFilters,
  ListReimbursementsResult,
  ReimbursementSummary
} from "./types";
