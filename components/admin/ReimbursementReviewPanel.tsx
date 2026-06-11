"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReimbursementWithUser, ReimbursementStatus, ReimbursementPaymentType } from "@/lib/reimbursements";
import { RejectReimburseModal } from "./RejectReimburseModal";

const PAGE_SIZE = 10;

type SortKey = "time-desc" | "amount-desc" | "amount-asc";

// V1.4 admin 报销审核 panel(设计参考 §4.3 + §3.24 驳回 modal)
// 列表 + 筛选 + mini-btn approve/reject + 凭证查看(新页打开)+ 驳回 modal

type Props = {
  initialRows: ReimbursementWithUser[];
  initialTotal: number;
  // Day 45:跨模块跳转(/manage?tab=audit&filter=pending)解析后传入,作为初始状态筛选
  defaultFilter?: "all" | ReimbursementStatus;
};

const PAYMENT_LABEL: Record<ReimbursementPaymentType, string> = {
  monthly: "月度订阅",
  annual: "年度订阅",
  api_topup: "API 充值",
  one_time: "一次性",
  plugin: "插件"
};

function brandColor(name: string): string {
  const map: Record<string, string> = {
    Cursor: "#1A1D24",
    Tripo: "#6B5BFF",
    Runway: "#111111",
    ElevenLabs: "#0E4F8F",
    Midjourney: "#7A4BFF",
    Suno: "#E0992F"
  };
  return map[name] ?? "#5C6373";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ReimbursementReviewPanel(props: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ReimbursementWithUser[]>(props.initialRows);
  const [filter, setFilter] = useState<"all" | ReimbursementStatus>(props.defaultFilter ?? "all");
  const [busy, setBusy] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<ReimbursementWithUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 新增：申请人搜索 + 金额排序 + 分页（10/页）
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("time-desc");
  const [page, setPage] = useState(1);

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter(r => r.status === "pending").length,
    approved: rows.filter(r => r.status === "approved").length,
    rejected: rows.filter(r => r.status === "rejected").length
  }), [rows]);

  // 状态筛选 → 申请人搜索 → 排序
  const filtered = useMemo(() => {
    const base = filter === "all" ? rows : rows.filter(r => r.status === filter);
    const q = search.trim().toLowerCase();
    const searched = q
      ? base.filter(r => {
          const name = (r.user_name ?? "").toLowerCase();
          const dept = (r.user_department_name ?? "").toLowerCase();
          return name.includes(q) || dept.includes(q);
        })
      : base;
    const sorted = [...searched];
    if (sort === "amount-desc") sorted.sort((a, b) => b.amount_cny - a.amount_cny);
    else if (sort === "amount-asc") sorted.sort((a, b) => a.amount_cny - b.amount_cny);
    else sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return sorted;
  }, [rows, filter, search, sort]);

  // 分页
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  // 任意筛选/搜索/排序变化 → 回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [filter, search, sort]);
  // 当前页超出范围（如删除后） → 拉回
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function callReview(id: number, action: "approve" | "reject", comment?: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reimbursements/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `审核失败 (${res.status})`);
      }
      const updated = (await res.json()) as ReimbursementWithUser;
      // 局部更新行,保留 joined user 字段
      setRows(prev => prev.map(r => (r.id === id ? { ...r, ...updated } : r)));
      router.refresh(); // 让 KPI / 其他 panel 同步
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setRejectModal(null);
    }
  }

  function handleApprove(r: ReimbursementWithUser) {
    if (confirm(`确认通过此报销?\n${r.request_number} · ${r.user_name} · ${r.tool_name} · ¥${r.amount_cny.toFixed(2)}`)) {
      callReview(r.id, "approve");
    }
  }

  function handleViewAttachments(r: ReimbursementWithUser) {
    // 简化:直接打开第一个凭证(实际生产环境抽屉式预览,V1 简化)
    if (r.attachment_urls.length === 0) return;
    window.open(`/api/files${r.attachment_urls[0]}`, "_blank");
  }

  return (
    <div>
      {/* Filter toolbar */}
      <div className="px-5 py-3 bg-bg/40 border-b border-border flex items-center gap-2 rounded-t-lg flex-wrap">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label="全部" count={counts.all} />
        <Chip
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
          label="待审核"
          count={counts.pending}
          alert={counts.pending > 0}
        />
        <Chip active={filter === "approved"} onClick={() => setFilter("approved")} label="已通过" count={counts.approved} />
        <Chip active={filter === "rejected"} onClick={() => setFilter("rejected")} label="已驳回" count={counts.rejected} />

        <div className="flex-1" />

        {/* 申请人 / 部门 搜索 */}
        <SearchBox value={search} onChange={setSearch} placeholder="搜索申请人 / 部门" />

        {/* 金额排序 */}
        <SortToggle value={sort} onChange={setSort} />

        {error && <span className="w-full text-cap text-danger mt-1">{error}</span>}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="text-center text-text-3 py-16">
          {rows.length === 0
            ? "暂无报销申请"
            : filtered.length === 0
              ? "没有匹配的记录"
              : "本页无数据"}
        </div>
      ) : (
        <table className="w-full text-body bg-card">
          <thead>
            <tr className="text-sub text-text-2 border-b border-border">
              <th className="text-left px-5 py-3 font-medium w-[90px]">单号</th>
              <th className="text-left px-3 py-3 font-medium w-[180px]">申请人</th>
              <th className="text-left px-3 py-3 font-medium">工具 / 类型</th>
              <th className="text-right px-3 py-3 font-medium w-[110px]">金额</th>
              <th className="text-left px-3 py-3 font-medium w-[160px]">使用周期</th>
              <th className="text-left px-3 py-3 font-medium w-[80px]">凭证</th>
              <th className="text-left px-3 py-3 font-medium w-[110px]">提交</th>
              <th className="text-left px-3 py-3 font-medium w-[160px]">状态</th>
              <th className="text-right px-5 py-3 font-medium w-[160px]">操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-bg/30">
                <td className="px-5 py-3 num text-small text-text-2">{r.request_number}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-primary-soft text-primary text-small font-semibold shrink-0">
                      {r.user_name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-body truncate">{r.user_name}</div>
                      <div className="text-cap text-text-3 truncate">{r.user_department_name ?? "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-7 h-7 rounded-sm inline-flex items-center justify-center text-white text-cap font-semibold shrink-0"
                      style={{ background: brandColor(r.tool_name) }}
                    >
                      {r.tool_name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-body font-medium truncate">{r.tool_name}</div>
                      <div className="text-cap text-text-3">{PAYMENT_LABEL[r.payment_type]}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right num text-body font-medium">
                  <span className="text-text-3 mr-0.5">¥</span>
                  {r.amount_cny.toFixed(2)}
                </td>
                <td className="px-3 py-3 text-small text-text-2 num">
                  {r.usage_period_start} → {r.usage_period_end.slice(5)}
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => handleViewAttachments(r)}
                    disabled={r.attachment_urls.length === 0}
                    className="inline-flex items-center gap-1 text-small text-primary hover:text-primary-ink disabled:opacity-40"
                    title="查看凭证"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12s-3.5 7-9 7-9-7-9-7 3.5-7 9-7 9 7 9 7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span className="num">{r.attachment_urls.length}</span>
                  </button>
                </td>
                <td className="px-3 py-3 text-small text-text-3 num">{formatTime(r.created_at)}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={r.status} />
                  {r.status === "rejected" && r.review_comment && (
                    <p className="mt-1 text-cap text-danger bg-danger-soft border border-danger/20 rounded-sm px-2 py-0.5 line-clamp-2" title={r.review_comment}>
                      {r.review_comment}
                    </p>
                  )}
                </td>
                <td className="px-5 py-3">
                  {r.status === "pending" ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <MiniBtn
                        variant="approve"
                        disabled={busy === r.id}
                        onClick={() => handleApprove(r)}
                      >
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                        通过
                      </MiniBtn>
                      <MiniBtn
                        variant="reject"
                        disabled={busy === r.id}
                        onClick={() => setRejectModal(r)}
                      >
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                        驳回
                      </MiniBtn>
                    </div>
                  ) : (
                    <div className="text-right text-cap text-text-3">
                      {r.reviewed_at ? `已审 ${formatTime(r.reviewed_at)}` : "—"}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination footer */}
      {filtered.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      )}

      {/* Reject modal */}
      {rejectModal && (
        <RejectReimburseModal
          open={true}
          request_number={rejectModal.request_number}
          amount_cny={rejectModal.amount_cny}
          tool_name={rejectModal.tool_name}
          user_name={rejectModal.user_name}
          submitting={busy === rejectModal.id}
          onCancel={() => setRejectModal(null)}
          onConfirm={comment => callReview(rejectModal.id, "reject", comment)}
        />
      )}
    </div>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────────────────

function Chip({ active, onClick, label, count, alert }: { active: boolean; onClick: () => void; label: string; count: number; alert?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-[30px] px-3 rounded-md text-small transition inline-flex items-center gap-1.5 " +
        (active ? "bg-primary-soft text-primary font-medium" : "border border-border bg-card text-text-2 hover:border-border-strong")
      }
    >
      {label}
      <span className={"num " + (alert && !active ? "text-danger font-medium" : "text-text-3")}>
        · {count}
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: ReimbursementStatus }) {
  const cfg = {
    pending: { bg: "bg-warn-soft", fg: "text-warn", label: "审核中" },
    approved: { bg: "bg-success-soft", fg: "text-success", label: "已通过" },
    rejected: { bg: "bg-danger-soft", fg: "text-danger", label: "已驳回" }
  }[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-chip font-medium ${cfg.bg} ${cfg.fg}`}>
      {cfg.label}
    </span>
  );
}

function MiniBtn({
  variant,
  disabled,
  onClick,
  children
}: {
  variant: "approve" | "reject";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls = variant === "approve"
    ? "bg-success-soft text-success hover:bg-success hover:text-white"
    : "bg-danger-soft text-danger hover:bg-danger hover:text-white";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-7 px-2.5 rounded-md text-cap font-medium inline-flex items-center gap-1 transition disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

// ─── 申请人 / 部门 搜索框 ─────────────────────────────────────
function SearchBox({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative inline-flex items-center">
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-2.5 text-text-3"
      >
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[30px] pl-8 pr-7 w-[200px] rounded-md border border-border bg-card text-small text-text outline-none transition focus:border-primary"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="清空"
          className="absolute right-2 text-text-3 hover:text-text"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── 金额排序切换（三态：时间倒序 / 金额降 / 金额升） ──────────
function SortToggle({
  value,
  onChange
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  // 点"金额"按钮在 desc ↔ asc 间循环；再点其他态切到时间倒序
  function cycle() {
    if (value === "amount-desc") onChange("amount-asc");
    else if (value === "amount-asc") onChange("time-desc");
    else onChange("amount-desc");
  }
  const active = value === "amount-desc" || value === "amount-asc";
  const arrow = value === "amount-asc" ? "↑" : value === "amount-desc" ? "↓" : "";
  return (
    <button
      type="button"
      onClick={cycle}
      title={
        value === "time-desc"
          ? "当前按提交时间排序，点击切到金额降序"
          : value === "amount-desc"
            ? "金额降序，点击切到升序"
            : "金额升序，点击恢复时间倒序"
      }
      className={
        "h-[30px] px-3 rounded-md text-small inline-flex items-center gap-1.5 transition border " +
        (active
          ? "bg-primary-soft text-primary border-transparent font-medium"
          : "bg-card text-text-2 border-border hover:border-border-strong")
      }
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h13M3 12h9M3 18h5" />
        <path d="M17 5v14M14 16l3 3 3-3" />
      </svg>
      金额
      {arrow && (
        <span className="num text-cap" style={{ marginLeft: 2 }}>
          {arrow}
        </span>
      )}
    </button>
  );
}

// ─── 分页 footer ──────────────────────────────────────────────
function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onChange
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  return (
    <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-bg/20 rounded-b-lg">
      <span className="text-cap text-text-3">
        第 <span className="num text-text-2 font-medium">{from}</span>–
        <span className="num text-text-2 font-medium">{to}</span> 条 · 共{" "}
        <span className="num text-text-2 font-medium">{totalItems}</span> 条
      </span>
      <div className="inline-flex items-center gap-1">
        <PageBtn
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          label="上一页"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </PageBtn>
        <span className="num text-cap text-text-2 px-2">
          {page} / {totalPages}
        </span>
        <PageBtn
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          label="下一页"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </PageBtn>
      </div>
    </div>
  );
}

function PageBtn({
  disabled,
  onClick,
  label,
  children
}: {
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="h-7 w-7 rounded-md inline-flex items-center justify-center text-text-2 border border-border bg-card transition hover:border-border-strong hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
