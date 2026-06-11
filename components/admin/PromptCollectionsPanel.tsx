"use client";

import { useState, useEffect, useMemo } from "react";
import type { AdminCollectionRow, AdminCollectionStats } from "@/lib/db/queries";

// V1.8 admin Prompt 收藏监控 panel(设计参考 §4.3 + §3.18 sub tab 集成)
// 4 stat 卡 + filter toolbar(kind chip + 部门 + 用户 + 搜索)+ 卡片网格(2-3 列响应式)+ 分页

type FilterOpts = {
  departments: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
};

type Props = {
  initialRows: AdminCollectionRow[];
  initialStats: AdminCollectionStats;
  initialTotal: number;
  filterOpts: FilterOpts;
};

// Day 45 续:Prompt 监控精简到 6 张(2 行 × 3 列预览),让用户"知道功能在"即可
const PAGE_SIZE = 6;

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

export function PromptCollectionsPanel(props: Props) {
  const [kind, setKind] = useState<"all" | "image" | "video">("all");
  const [deptId, setDeptId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminCollectionRow[]>(props.initialRows);
  const [stats, setStats] = useState<AdminCollectionStats>(props.initialStats);
  const [total, setTotal] = useState(props.initialTotal);
  const [loading, setLoading] = useState(false);

  const isInitial = useInitialMountFlag();

  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    if (kind !== "all") sp.set("kind", kind);
    if (deptId) sp.set("department_id", deptId);
    if (userId) sp.set("user_id", userId);
    if (search.trim()) sp.set("search", search.trim());
    sp.set("page", String(page));
    sp.set("page_size", String(PAGE_SIZE));
    return sp;
  }, [kind, deptId, userId, search, page]);

  useEffect(() => {
    if (isInitial) return;
    const ac = new AbortController();
    setLoading(true);
    fetch(`/api/admin/prompt-collections?${queryParams.toString()}`, { signal: ac.signal })
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setStats(d.stats ?? props.initialStats);
        setTotal(d.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams.toString()]);

  function resetFilters() {
    setKind("all");
    setDeptId("");
    setUserId("");
    setSearch("");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* 4 stat 卡 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="总收藏数" value={stats.total.toLocaleString()} unit="条" tone="default" />
        <StatCard label="图片收藏" value={stats.image_count.toLocaleString()} unit="条" tone="blue" />
        <StatCard label="视频收藏" value={stats.video_count.toLocaleString()} unit="条" tone="violet" />
        <StatCard
          label="热门模型"
          value={stats.top_model?.name ?? "—"}
          unit={stats.top_model ? `${stats.top_model.count} 次` : ""}
          tone="green"
          isText
        />
      </div>

      {/* Filter toolbar + 卡片网格 */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 bg-bg/40 border-b border-border flex items-center gap-2 flex-wrap">
          <FilterChip active={kind === "all"} onClick={() => { setKind("all"); setPage(1); }}>全部</FilterChip>
          <FilterChip active={kind === "image"} onClick={() => { setKind("image"); setPage(1); }}>图片</FilterChip>
          <FilterChip active={kind === "video"} onClick={() => { setKind("video"); setPage(1); }}>视频</FilterChip>

          <Select value={deptId} onChange={v => { setDeptId(v); setPage(1); }}>
            <option value="">全部部门</option>
            {props.filterOpts.departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>

          <Select value={userId} onChange={v => { setUserId(v); setPage(1); }}>
            <option value="">全部员工</option>
            {props.filterOpts.users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center h-[30px] rounded-md border border-border bg-card px-3 min-w-[220px]">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-text-3 shrink-0">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="搜索 prompt / title / tag…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="ml-2 flex-1 bg-transparent outline-none text-body placeholder:text-placeholder"
              />
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3 rounded-md border border-border bg-card text-small text-text-2 hover:border-border-strong"
            >
              重置
            </button>
          </div>
        </div>

        {/* 卡片网格 */}
        {loading ? (
          <div className="text-center text-text-3 py-10">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-text-3 py-16">没有匹配的收藏</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 p-5">
            {rows.map(r => (
              <CollectionMonitorCard key={r.id} row={r} />
            ))}
          </div>
        )}

        {/* 分页 */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 text-small text-text-2 border-t border-border">
            <span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
            <div className="flex gap-2">
              <PagerBtn disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</PagerBtn>
              <PagerBtn disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一页</PagerBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────────────────

function CollectionMonitorCard({ row }: { row: AdminCollectionRow }) {
  return (
    <div className="bg-card border border-border rounded-md p-4 hover:border-border-strong hover:shadow-sm transition">
      {/* 用户 + 收藏时间 */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-primary-soft text-primary text-small font-semibold shrink-0">
            {row.user_name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div className="text-body truncate">{row.user_name}</div>
            <div className="text-cap text-text-3 truncate">{row.user_department_name ?? "—"}</div>
          </div>
        </div>
        <span className="text-cap text-text-3 shrink-0">{formatShortDate(row.created_at)}</span>
      </div>

      {/* 标题 + 收藏星 */}
      <div className="flex items-start gap-2 mb-2">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className="text-warn shrink-0 mt-0.5">
          <path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.6l-5.88 3.01 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z" />
        </svg>
        <p className="text-body font-medium text-text line-clamp-1 flex-1" title={row.title}>{row.title}</p>
      </div>

      {/* prompt 文本(3 行截断) */}
      <p className="text-sub text-text-2 bg-bg border border-border rounded p-2.5 leading-relaxed line-clamp-3 mb-2" title={row.prompt_text}>
        {row.prompt_text}
      </p>

      {/* tags */}
      {row.tags && (
        <div className="flex flex-wrap gap-1 mb-2">
          {row.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
            <span key={t} className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-chip bg-bg text-text-2 border border-border">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* meta:模型 + 类型 + 比例/时长 */}
      <div className="flex items-center gap-2 text-cap text-text-3">
        <span className={
          "inline-flex items-center px-1.5 py-0 rounded-sm text-chip h-[18px] " +
          (row.kind === "image" ? "bg-primary-soft text-primary" : "bg-violet-soft text-violet")
        }>
          {row.kind === "image" ? "图片" : "视频"}
        </span>
        <span className="truncate">{row.model_name}</span>
        {row.ratio_or_duration && <span>· {row.ratio_or_duration}</span>}
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, tone, isText }: {
  label: string;
  value: string;
  unit: string;
  tone: "default" | "blue" | "violet" | "green";
  isText?: boolean;
}) {
  const valueColor = {
    default: "text-text",
    blue: "text-primary",
    violet: "text-violet",
    green: "text-success"
  }[tone];
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-cap text-text-3 mb-1">{label}</p>
      <div className={"flex items-baseline gap-1 " + valueColor}>
        <span className={isText ? "text-h1 font-semibold truncate" : "text-kpi num"}>{value}</span>
        {unit && <span className="text-small text-text-3 font-medium ml-1">{unit}</span>}
      </div>
    </div>
  );
}

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

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
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
