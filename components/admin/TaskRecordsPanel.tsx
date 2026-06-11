"use client";

import { useEffect, useState, useMemo } from "react";
import type { AdminTaskRow } from "@/lib/db/queries";

// V1.7 admin 任务记录查询 panel(设计参考 §4.3 任务记录子 tab)
// 多维筛选 + 表格 + 分页 + CSV 导出

type FilterOpts = {
  departments: Array<{ id: string; name: string }>;
  models: string[];
  purposes: string[];
};

type Props = {
  initialRows: AdminTaskRow[];
  initialTotal: number;
  filterOpts: FilterOpts;
  /** 可选：从 URL ?dept= 预填的部门 id（来自部门看板"查看任务记录"跳转） */
  defaultDeptId?: string;
  /** 可选：从 URL ?user= 预填的用户 id（来自 AI 洞察"员工突增"或成员表行点击跳转） */
  defaultUserId?: string;
  /** 可选：预填用户名（仅用于 chip 显示，避免再查 DB） */
  defaultUserName?: string;
};

// Day 45 续:任务记录精简到 10 行 — 数据看板里"知道有这个查询入口"即可,要细查走 CSV
const PAGE_SIZE = 10;

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  succeeded: { label: "成功", cls: "bg-success-soft text-success" },
  failed: { label: "失败", cls: "bg-danger-soft text-danger" },
  cancelled: { label: "已取消", cls: "bg-bg text-text-3 border border-border" },
  running: { label: "运行中", cls: "bg-warn-soft text-warn" },
  queued: { label: "排队中", cls: "bg-primary-soft text-primary" }
};

export function TaskRecordsPanel(props: Props) {
  const [type, setType] = useState<"all" | "image" | "video">("all");
  const [status, setStatus] = useState<"all" | string>("all");
  const [deptId, setDeptId] = useState<string>(props.defaultDeptId ?? "");
  const [userId, setUserId] = useState<string>(props.defaultUserId ?? "");
  const [model, setModel] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [dateRange, setDateRange] = useState<"all" | "7d" | "30d" | "month">("30d");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminTaskRow[]>(props.initialRows);
  const [total, setTotal] = useState(props.initialTotal);
  const [loading, setLoading] = useState(false);

  const isInitial = useInitialMountFlag();

  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    if (type !== "all") sp.set("type", type);
    if (status !== "all") sp.set("status", status);
    if (deptId) sp.set("department_id", deptId);
    if (userId) sp.set("user_id", userId);
    if (model) sp.set("model_name", model);
    if (purpose) sp.set("purpose_tag_name", purpose);
    if (search.trim()) sp.set("search", search.trim());
    const range = computeRange(dateRange);
    if (range.from) sp.set("date_from", range.from);
    sp.set("page", String(page));
    sp.set("page_size", String(PAGE_SIZE));
    return sp;
  }, [type, status, deptId, userId, model, purpose, search, dateRange, page]);

  useEffect(() => {
    if (isInitial) return;
    const ac = new AbortController();
    setLoading(true);
    fetch(`/api/admin/tasks?${queryParams.toString()}`, { signal: ac.signal })
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams.toString()]);

  function resetFilters() {
    setType("all");
    setStatus("all");
    setDeptId("");
    setUserId("");
    setModel("");
    setPurpose("");
    setSearch("");
    setDateRange("30d");
    setPage(1);
  }

  function downloadCsv() {
    // 复用同样 filter,服务端走 export 路由
    const exportParams = new URLSearchParams(queryParams);
    exportParams.delete("page");
    exportParams.delete("page_size");
    window.location.href = `/api/admin/tasks/export?${exportParams.toString()}`;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Filter toolbar */}
      <div className="px-5 py-3 bg-bg/40 border-b border-border space-y-2">
        {userId && (
          <div className="flex items-center gap-2 text-small">
            <span className="text-text-3">当前筛选用户：</span>
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-primary"
              style={{ background: "var(--accent-soft)" }}
            >
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
              </svg>
              {props.defaultUserName ?? userId.slice(0, 8)}
              <button
                type="button"
                onClick={() => { setUserId(""); setPage(1); }}
                aria-label="清除用户筛选"
                title="清除"
                className="ml-1 -mr-1 w-4 h-4 inline-flex items-center justify-center rounded text-text-3 hover:text-text"
              >
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip active={type === "all"} onClick={() => { setType("all"); setPage(1); }}>全部类型</FilterChip>
          <FilterChip active={type === "image"} onClick={() => { setType("image"); setPage(1); }}>图片</FilterChip>
          <FilterChip active={type === "video"} onClick={() => { setType("video"); setPage(1); }}>视频</FilterChip>

          <span className="mx-1 text-text-3 text-cap">|</span>

          <FilterChip active={status === "all"} onClick={() => { setStatus("all"); setPage(1); }}>全部状态</FilterChip>
          <FilterChip active={status === "succeeded"} onClick={() => { setStatus("succeeded"); setPage(1); }}>成功</FilterChip>
          <FilterChip active={status === "failed"} onClick={() => { setStatus("failed"); setPage(1); }}>失败</FilterChip>
          <FilterChip active={status === "cancelled"} onClick={() => { setStatus("cancelled"); setPage(1); }}>取消</FilterChip>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3 rounded-md border border-border bg-card text-small text-text-2 hover:border-border-strong"
            >
              重置
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="h-[30px] px-3 rounded-md bg-primary text-white text-small font-medium hover:bg-primary-ink inline-flex items-center gap-1.5"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v12" />
                <path d="M6 12l6 6 6-6" />
                <path d="M4 20h16" />
              </svg>
              导出 CSV
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 部门下拉 */}
          <Select value={deptId} onChange={v => { setDeptId(v); setPage(1); }}>
            <option value="">全部部门</option>
            {props.filterOpts.departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>

          {/* 模型下拉 */}
          <Select value={model} onChange={v => { setModel(v); setPage(1); }}>
            <option value="">全部模型</option>
            {props.filterOpts.models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>

          {/* 使用目的下拉 */}
          <Select value={purpose} onChange={v => { setPurpose(v); setPage(1); }}>
            <option value="">全部使用目的</option>
            {props.filterOpts.purposes.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>

          {/* 时间范围 */}
          <Select value={dateRange} onChange={v => { setDateRange(v as "all" | "7d" | "30d" | "month"); setPage(1); }}>
            <option value="all">全部时间</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
            <option value="month">本月</option>
          </Select>

          {/* 搜索框 */}
          <div className="ml-auto flex items-center h-[30px] rounded-md border border-border bg-card px-3 min-w-[240px]">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-text-3 shrink-0">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="搜索 Prompt 内容…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="ml-2 flex-1 bg-transparent outline-none text-body placeholder:text-placeholder"
            />
          </div>
        </div>
      </div>

      {/* 表格 */}
      <table className="w-full text-body">
        <thead>
          <tr className="text-sub text-text-2 border-b border-border">
            <th className="text-left px-4 py-3 font-medium w-[120px]">GEN-ID</th>
            <th className="text-left px-3 py-3 font-medium w-[180px]">申请人</th>
            <th className="text-left px-3 py-3 font-medium">Prompt</th>
            <th className="text-left px-3 py-3 font-medium w-[100px]">使用目的</th>
            <th className="text-left px-3 py-3 font-medium w-[140px]">模型</th>
            <th className="text-right px-3 py-3 font-medium w-[90px]">积分</th>
            <th className="text-left px-3 py-3 font-medium w-[150px]">时间</th>
            <th className="text-left px-3 py-3 font-medium w-[90px]">状态</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={8} className="text-center text-text-3 py-10">加载中…</td></tr>
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={8} className="text-center text-text-3 py-12">没有匹配的任务,试试调整筛选条件</td></tr>
          )}
          {!loading && rows.map(r => {
            const cfg = STATUS_LABELS[r.status] ?? { label: r.status, cls: "bg-bg text-text-3 border border-border" };
            return (
              <tr key={r.id} className="border-t border-border hover:bg-bg/30">
                <td className="px-4 py-3 num text-cap text-text-3" title={r.id}>{r.id.slice(0, 8)}…</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-primary-soft text-primary text-small font-semibold shrink-0">
                      {r.user_name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-body truncate">{r.user_name}</div>
                      <div className="text-cap text-text-3 truncate">{r.department_name ?? "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <p className="text-body line-clamp-2 max-w-[380px]" title={r.prompt}>{r.prompt}</p>
                  <p className="text-cap text-text-3 mt-0.5">
                    {r.type === "video" && r.duration_seconds ? `${r.duration_seconds}s · ${r.ratio}` : r.ratio}
                  </p>
                </td>
                <td className="px-3 py-3 text-small text-text-2">{r.purpose_tag_name}</td>
                <td className="px-3 py-3 text-small text-text-2 truncate">{r.model_name}</td>
                <td className="px-3 py-3 text-right num text-small">{r.credits_cost?.toLocaleString() ?? "—"}</td>
                <td className="px-3 py-3 text-small text-text-3 num">{formatTime(r.created_at)}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-chip font-medium ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pager */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-4 text-small text-text-2 border-t border-border">
          <span>共 {total} 条,第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <PagerBtn disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</PagerBtn>
            <PagerBtn disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一页</PagerBtn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────────────────

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-[30px] px-3 rounded-md text-small transition " +
        (active ? "bg-primary-soft text-primary font-medium" : "border border-border bg-card text-text-2 hover:border-border-strong")
      }
    >
      {children}
    </button>
  );
}

function Select({
  value, onChange, children
}: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="h-[30px] px-3 rounded-md border border-border bg-card flex items-center gap-1 text-small text-text-2 hover:border-border-strong">
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-transparent outline-none text-body">
        {children}
      </select>
    </div>
  );
}

function PagerBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-7 px-3 rounded border border-border text-small disabled:opacity-40 disabled:cursor-not-allowed hover:border-border-strong"
    >
      {children}
    </button>
  );
}

function useInitialMountFlag(): boolean {
  const [first, setFirst] = useState(true);
  useEffect(() => { setFirst(false); }, []);
  return first;
}

function computeRange(r: "all" | "7d" | "30d" | "month"): { from?: string } {
  if (r === "all") return {};
  const now = new Date();
  if (r === "7d") return { from: new Date(now.getTime() - 7 * 86400_000).toISOString() };
  if (r === "30d") return { from: new Date(now.getTime() - 30 * 86400_000).toISOString() };
  // month
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return { from: start };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}
