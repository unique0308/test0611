// 设计参考 §3.24:驳回 modal 的 5 个预设原因 chip
// 决策 D1 / D2 / V1.4:1 级 admin 审批,驳回必填 comment
// 前端 chip 点击预填进 textarea(后端 zod 只校验 comment 非空)

export const REJECT_REASON_PRESETS = [
  "凭证不清晰,请补充发票或邮件原件",
  "金额超出本月人均报销上限",
  "该工具已被平台覆盖,无需重复采购",
  "使用说明不充分,缺少业务场景",
  "非公司允许的工具类型"
] as const;

export type RejectReasonPreset = (typeof REJECT_REASON_PRESETS)[number];
