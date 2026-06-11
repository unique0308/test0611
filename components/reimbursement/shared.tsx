// 报销模块共享:常量 / 纯函数 / 状态徽章(2026-05-21 报销模块重塑)

import type { ReimbursementPaymentType, ReimbursementStatus } from "@/lib/reimbursements";

export type PaymentTypeOpt = { value: ReimbursementPaymentType; label: string };

// 费用类型 5 选项(D2 对齐:monthly / annual / api_topup / one_time / plugin)
export const PAYMENT_TYPES: PaymentTypeOpt[] = [
  { value: "monthly", label: "月度订阅" },
  { value: "annual", label: "年度订阅" },
  { value: "api_topup", label: "API 充值 / 按量计费" },
  { value: "one_time", label: "一次性购买" },
  { value: "plugin", label: "插件 / 扩展" }
];

export function paymentTypeLabel(t: ReimbursementPaymentType): string {
  return PAYMENT_TYPES.find(p => p.value === t)?.label ?? t;
}

export function formatAmount(n: number): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 工具品牌色(报销 logo 方块)
const BRAND: Record<string, string> = {
  Cursor: "#1A1D24",
  Tripo: "#6B5BFF",
  Runway: "#111111",
  ElevenLabs: "#0E4F8F",
  Midjourney: "#7A4BFF",
  Suno: "#E0992F"
};

export function brandColor(name: string): string {
  return BRAND[name] ?? "#5C6373";
}

const STATUS_CFG: Record<ReimbursementStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: "bg-warn-soft", fg: "text-warn", label: "审核中" },
  approved: { bg: "bg-success-soft", fg: "text-success", label: "已通过" },
  rejected: { bg: "bg-danger-soft", fg: "text-danger", label: "已驳回" }
};

export function statusLabel(status: ReimbursementStatus): string {
  return STATUS_CFG[status].label;
}

// 3 状态徽章(D2:pending / approved / rejected)
export function ReimbStatusBadge({ status }: { status: ReimbursementStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-chip font-medium ${cfg.bg} ${cfg.fg}`}>
      {cfg.label}
    </span>
  );
}

// 工具 logo 方块(首字母 + 品牌色)
export function ToolLogo({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      className="rounded-sm inline-flex items-center justify-center text-white font-semibold shrink-0"
      style={{ background: brandColor(name), width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
