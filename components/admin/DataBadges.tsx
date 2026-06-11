// 数据可信度标识 chip — admin 看板上区分"演示数据 / 估算 / 真实"
// 目的：admin 一眼看出某块数据是不是真值，避免用 fixture 数字做决策
// 用法：放在 section-title 的尾部，与 section-hint 并列

import { Icon } from "@/components/ui/icons";

/** 演示数据：完全是 fixture，等后端字段就位后接入 */
export function DemoBadge({ reason }: { reason?: string }) {
  return (
    <span
      className="chip"
      title={reason ?? "本块为 fixture 演示数据，等后端字段补齐后切换为真实值"}
      style={{
        height: 18,
        padding: "0 7px",
        fontSize: 10,
        background: "var(--warn-soft)",
        color: "var(--warn)",
        fontWeight: 600,
        letterSpacing: "0.02em",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0
      }}
    >
      <Icon name="alert" size={10} />
      演示数据
    </span>
  );
}

/** 估算：底层数据真实，但当前展示维度是按比例反推/聚合得到的近似值 */
export function EstimateBadge({ reason }: { reason?: string }) {
  return (
    <span
      className="chip"
      title={reason ?? "当前为估算值，待后端补齐精确字段后切换为真实拆分"}
      style={{
        height: 18,
        padding: "0 7px",
        fontSize: 10,
        background: "var(--accent-soft)",
        color: "var(--accent-ink)",
        fontWeight: 600,
        letterSpacing: "0.02em",
        flexShrink: 0
      }}
    >
      估算
    </span>
  );
}
