"use client";

import { useMemo, useState } from "react";
import type { ReimbursementRequest, ReimbursementStatus } from "@/lib/reimbursements";
import { ToolLogo, ReimbStatusBadge, paymentTypeLabel, formatAmount } from "./shared";

// 工具报销 - 记录查询(2026-05-21 重塑:状态筛选 + 搜索 + 表格,行点击开详情)

type Props = {
  rows: ReimbursementRequest[];
  onOpenDetail: (id: number) => void;
};

export function ReimbursementRecords({ rows, onOpenDetail }: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | ReimbursementStatus>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter(r => r.status === "pending").length,
      approved: rows.filter(r => r.status === "approved").length,
      rejected: rows.filter(r => r.status === "rejected").length
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (kw && !r.tool_name.toLowerCase().includes(kw) && !r.request_number.toLowerCase().includes(kw)) {
        return false;
      }
      return true;
    });
  }, [rows, statusFilter, q]);

  return (
    <div>
      {/* toolbar:状态 chip + 搜索 */}
      <div className="px-6 py-3.5 border-b border-border flex items-center gap-2 flex-wrap bg-bg/40">
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label="全部" count={counts.all} />
        <FilterChip active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} label="审核中" count={counts.pending} />
        <FilterChip active={statusFilter === "approved"} onClick={() => setStatusFilter("approved")} label="已通过" count={counts.approved} />
        <FilterChip active={statusFilter === "rejected"} onClick={() => setStatusFilter("rejected")} label="已驳回" count={counts.rejected} />
        <div className="ml-auto h-9 px-3 rounded-md border border-border-strong bg-card inline-flex items-center gap-1.5 min-w-[200px]">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-3 shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索工具名 / 单号"
            className="flex-1 min-w-0 bg-transparent outline-none text-sub text-text placeholder:text-text-3"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center text-text-3 py-16">
          {rows.length === 0 ? "还没有报销记录,提交第一笔申请试试吧" : "没有匹配的记录,试试切换筛选 / 清空搜索"}
        </div>
      ) : (
        <table className="w-full text-body">
          <thead>
            <tr className="text-sub text-text-2 border-b border-border">
              <th className="text-left px-6 py-3 font-medium w-[96px]">单号</th>
              <th className="text-left px-3 py-3 font-medium">工具 / 类型</th>
              <th className="text-right px-3 py-3 font-medium w-[120px]">金额</th>
              <th className="text-left px-3 py-3 font-medium w-[176px]">使用周期</th>
              <th className="text-left px-3 py-3 font-medium w-[200px]">状态</th>
              <th className="w-[44px]" />
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr
                key={r.id}
                onClick={() => onOpenDetail(r.id)}
                className="group border-t border-border cursor-pointer hover:bg-bg/40 transition"
              >
                <td className="px-6 py-3 num text-small text-text-2">{r.request_number}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <ToolLogo name={r.tool_name} size={30} />
                    <div className="min-w-0">
                      <div className="text-body font-medium truncate">{r.tool_name}</div>
                      <div className="text-cap text-text-3">{paymentTypeLabel(r.payment_type)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right num text-body font-medium">
                  <span className="text-text-3 mr-0.5">¥</span>
                  {formatAmount(r.amount_cny)}
                </td>
                <td className="px-3 py-3 text-small text-text-2 num">
                  {r.usage_period_start} → {r.usage_period_end.slice(5)}
                </td>
                <td className="px-3 py-3">
                  <ReimbStatusBadge status={r.status} />
                  {r.status === "rejected" && r.review_comment && (
                    <p className="mt-1 text-cap text-danger line-clamp-1" title={r.review_comment}>
                      驳回:{r.review_comment}
                    </p>
                  )}
                </td>
                <td className="pr-4 text-text-3 group-hover:text-primary transition">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-9 px-3 rounded-md text-small transition inline-flex items-center gap-1.5 " +
        (active
          ? "bg-primary-soft text-primary font-medium"
          : "border border-border bg-card text-text-2 hover:border-border-strong")
      }
    >
      {label}
      <span className="num text-text-3">· {count}</span>
    </button>
  );
}
