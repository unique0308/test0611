export type StatusKey =
  | "pending"
  | "approved"
  | "rejected"
  | "ok"
  | "warn"
  | "danger";

const MAP: Record<StatusKey, { cls: string; label: string }> = {
  pending: { cls: "chip-soft-warn", label: "待审" },
  approved: { cls: "chip-soft-success", label: "已通过" },
  rejected: { cls: "chip-soft-danger", label: "已驳回" },
  ok: { cls: "chip-soft-success", label: "正常" },
  warn: { cls: "chip-soft-warn", label: "临近上限" },
  danger: { cls: "chip-soft-danger", label: "超额" }
};

interface Props {
  status: StatusKey | string;
}

export function StatusBadge({ status }: Props) {
  const m = (MAP as Record<string, { cls: string; label: string }>)[status] ?? {
    cls: "",
    label: status
  };
  return <span className={`chip ${m.cls}`}>{m.label}</span>;
}
