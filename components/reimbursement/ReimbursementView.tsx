"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ReimbursementRequest,
  ReimbursementToolPreset,
  ReimbursementSummary
} from "@/lib/reimbursements";
import { ReimbursementForm } from "./ReimbursementForm";
import { ReimbursementRecords } from "./ReimbursementRecords";
import { ReimbursementDetailModal } from "./ReimbursementDetailModal";
import { formatAmount } from "./shared";

// 工具报销页主体(2026-05-21 重塑:顶级页 + 单行统计条 + 申请/记录 子 tab)

type Props = {
  summary: ReimbursementSummary;
  toolPresets: ReimbursementToolPreset[];
  initialRows: ReimbursementRequest[];
  initialTotal: number;
};

type Tab = "apply" | "records";

export function ReimbursementView(props: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("apply");
  const [detailId, setDetailId] = useState<number | null>(null);

  // 提交成功 → 切到「报销记录」+ 刷新 SSR(initialRows 更新)
  function handleSubmitted() {
    setTab("records");
    router.refresh();
  }

  const s = props.summary;

  return (
    <div className="mx-auto max-w-content w-full px-8 py-6">
      {/* 单行统计条 */}
      <div className="mb-4 flex items-center flex-wrap gap-y-1 rounded-lg border border-border bg-card px-4 py-2.5">
        <Stat label="本年累计报销" value={`¥ ${formatAmount(s.year_total_cny)}`} sub={`${s.year_count} 笔`} />
        <Sep />
        <Stat label="审核中" value={`${s.pending_count} 笔`} sub={`¥ ${formatAmount(s.pending_cny)}`} tone="warn" />
        <Sep />
        <Stat label="本月已通过" value={`${s.month_approved_count} 笔`} tone="success" />
        <Sep />
        <Stat
          label="本月已驳回"
          value={`${s.month_rejected_count} 笔`}
          tone={s.month_rejected_count > 0 ? "danger" : undefined}
        />
      </div>

      {/* 子 tab */}
      <nav className="flex items-center gap-1 mb-3">
        <TabBtn active={tab === "apply"} onClick={() => setTab("apply")}>
          申请报销
        </TabBtn>
        <TabBtn active={tab === "records"} onClick={() => setTab("records")} count={props.initialTotal}>
          报销记录
        </TabBtn>
      </nav>

      {/* 内容面板 */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {tab === "apply" ? (
          <ReimbursementForm toolPresets={props.toolPresets} onSubmitted={handleSubmitted} />
        ) : (
          <ReimbursementRecords rows={props.initialRows} onOpenDetail={setDetailId} />
        )}
      </div>

      {/* 详情弹层 */}
      {detailId !== null && (
        <ReimbursementDetailModal id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn" | "success" | "danger";
}) {
  const toneCls =
    tone === "warn" ? "text-warn" : tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-text";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-small text-text-3">{label}</span>
      <span className={"text-body font-semibold num " + toneCls}>{value}</span>
      {sub && <span className="text-chip text-text-3">{sub}</span>}
    </span>
  );
}

function Sep() {
  return <span className="mx-3 inline-block h-3.5 w-px bg-border" />;
}

function TabBtn({
  active,
  onClick,
  count,
  children
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-9 px-3 inline-flex items-center gap-1.5 border-b-2 text-body transition " +
        (active
          ? "border-primary text-primary font-medium"
          : "border-transparent text-text-2 hover:text-text")
      }
    >
      {children}
      {count !== undefined && (
        <span
          className={
            "inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-sm text-chip num " +
            (active ? "bg-primary-soft text-primary" : "bg-bg text-text-3")
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}
