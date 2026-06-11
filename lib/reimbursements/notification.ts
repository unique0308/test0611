// V1.4 报销提交后通知 admin
// 走 lib/notifications 抽象层(mock 阶段 console.log,真实切飞书 webhook 只改 NOTIFICATION_MODE)
// 决策 D1:1 级 admin 单审,提交后只通知一次

import { sendAlert } from "@/lib/notifications";
import type { ReimbursementRequest } from "./types";

export async function notifyReimbursementSubmitted(args: {
  request: ReimbursementRequest;
  user_name: string;
  department_name: string | null;
}): Promise<void> {
  const r = args.request;
  const lines = [
    `🧾 报销申请待审核 · ${r.request_number}`,
    `申请人:${args.user_name}${args.department_name ? " · " + args.department_name : ""}`,
    `工具:${r.tool_name}  金额:¥ ${r.amount_cny.toFixed(2)}`,
    `周期:${r.usage_period_start} → ${r.usage_period_end}`,
    `说明:${r.purpose_description.slice(0, 80)}${r.purpose_description.length > 80 ? "…" : ""}`
  ];
  await sendAlert(lines.join(" · "));
}
