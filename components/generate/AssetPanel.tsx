"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedItem } from "./types";
import type { HistoryRow } from "@/components/history/types";
import { HistoryDetailModal } from "@/components/history/HistoryDetailModal";

// 生成页「资产面板」抽屉(2026-05-21:点「生成历史」弹出,参照 image#29)
// 会话资产 = 本次会话 feed;全局资产 = 全部历史(/api/tasks)
// 点缩略图 → 作品详情弹层;hover 图片缩略图 → 右上角「设为参考图」快捷键

type Scope = "session" | "global";
type AssetKind = "image" | "video";

type Props = {
  sessionItems: FeedItem[];
  onClose: () => void;
  onSetReference: (url: string) => void; // hover 快捷:把这张图设为生成参考图
};

// FeedItem(会话)→ HistoryRow,统一给 tile / 详情弹层用
function feedToRow(it: FeedItem): HistoryRow {
  const outs =
    it.outputs && it.outputs.length > 0
      ? it.outputs
      : it.file_url
        ? [{ file_url: it.file_url, file_type: it.file_type ?? "", output_index: 0 }]
        : [];
  return {
    id: it.id,
    type: it.type,
    status: it.status,
    prompt: it.prompt,
    ratio: it.ratio,
    duration_seconds: it.duration_seconds,
    model_name: it.model_name,
    purpose_tag_name: it.purpose_tag_name,
    credits_cost: it.credits_cost ?? null,
    created_at: it.created_at,
    result_file_path: null,
    result_file_type: null,
    file_url: it.file_url,
    collection_id: null,
    collection_tags: null,
    outputs: outs.map(o => ({
      output_index: o.output_index,
      file_url: o.file_url,
      file_type: o.file_type,
      width: null,
      height: null,
      collection_id: null,
      collection_tags: null
    }))
  };
}

type Tile = { row: HistoryRow; index: number; url: string };

export function AssetPanel({ sessionItems, onClose, onSetReference }: Props) {
  const [scope, setScope] = useState<Scope>("session");
  const [kind, setKind] = useState<AssetKind>("image");
  const [q, setQ] = useState("");
  const [globalRows, setGlobalRows] = useState<HistoryRow[] | null>(null);
  const globalFetchedRef = useRef(false);
  const [detail, setDetail] = useState<{ row: HistoryRow; index: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 全局资产懒加载(首次切到「全局资产」时拉一次;ref 守卫避免重复 / 自我中止)
  useEffect(() => {
    if (scope !== "global" || globalFetchedRef.current) return;
    globalFetchedRef.current = true;
    fetch("/api/tasks?page=1&page_size=60")
      .then(r => r.json())
      .then(d => setGlobalRows((d.rows as HistoryRow[]) ?? []))
      .catch(() => setGlobalRows([]));
  }, [scope]);

  const rows: HistoryRow[] = useMemo(
    () => (scope === "session" ? sessionItems.map(feedToRow) : globalRows ?? []),
    [scope, sessionItems, globalRows]
  );

  const tiles: Tile[] = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const out: Tile[] = [];
    for (const row of rows) {
      if (row.type !== kind) continue;
      if (row.status !== "succeeded" || row.outputs.length === 0) continue;
      if (kw && !row.prompt.toLowerCase().includes(kw)) continue;
      row.outputs.forEach((o, i) => {
        if (o.file_url) out.push({ row, index: i, url: o.file_url });
      });
    }
    // 统一按生成时间倒序(新 → 旧);同任务多图保持 output_index 升序
    out.sort((a, b) => {
      const dt = new Date(b.row.created_at).getTime() - new Date(a.row.created_at).getTime();
      return dt !== 0 ? dt : a.index - b.index;
    });
    return out;
  }, [rows, kind, q]);

  const loading = scope === "global" && globalRows === null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/20 animate-fade-in" onClick={onClose} />

      <aside className="absolute top-0 right-0 h-full w-[440px] bg-card border-l border-border shadow-md flex flex-col animate-slide-in-right">
        {/* header:会话/全局 切换 + 关闭 */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
          <div className="inline-flex bg-bg rounded-md p-0.5">
            <ScopeBtn active={scope === "session"} onClick={() => setScope("session")}>
              会话资产
            </ScopeBtn>
            <ScopeBtn active={scope === "global"} onClick={() => setScope("global")}>
              全局资产
            </ScopeBtn>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto w-8 h-8 rounded-md grid place-items-center text-text-3 hover:bg-bg hover:text-text transition"
          >
            <CloseIcon />
          </button>
        </div>

        {/* 搜索 */}
        <div className="px-4 pt-3 shrink-0">
          <div className="h-9 px-3 rounded-md border border-border-strong bg-card flex items-center gap-2">
            <SearchIcon />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={scope === "session" ? "搜索会话资产" : "搜索全部历史"}
              className="flex-1 min-w-0 bg-transparent outline-none text-sub text-text placeholder:text-text-3"
            />
          </div>
        </div>

        {/* 类型 tab */}
        <div className="flex items-center gap-1 px-4 pt-3 shrink-0">
          <KindTab active={kind === "image"} onClick={() => setKind("image")}>
            图片
          </KindTab>
          <KindTab active={kind === "video"} onClick={() => setKind("video")}>
            视频
          </KindTab>
        </div>

        {/* 网格 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-text-3 text-sub py-14">加载中…</div>
          ) : tiles.length === 0 ? (
            <div className="text-center text-text-3 text-sub py-14">
              {scope === "session" ? "本次会话还没有这类资产" : "暂无历史资产"}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {tiles.map(t => (
                <AssetTile
                  key={`${t.row.id}:${t.index}`}
                  tile={t}
                  onOpen={() => setDetail({ row: t.row, index: t.index })}
                  onSetReference={onSetReference}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {detail && (
        <HistoryDetailModal
          task={detail.row}
          initialIndex={detail.index}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────────────────

function AssetTile({
  tile,
  onOpen,
  onSetReference
}: {
  tile: Tile;
  onOpen: () => void;
  onSetReference: (url: string) => void;
}) {
  const isVideo = tile.row.type === "video";
  return (
    <div
      onClick={onOpen}
      className="group relative aspect-square rounded-md overflow-hidden border border-border bg-bg cursor-pointer hover:border-border-strong transition"
    >
      {isVideo ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={`${tile.url}#t=0.1`} muted preload="metadata" className="absolute inset-0 w-full h-full object-cover bg-black" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tile.url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* AI 生成 角标 */}
      <span className="absolute left-1.5 top-1.5 px-1.5 py-0.5 rounded bg-black/45 text-white text-[10px] backdrop-blur-sm">
        AI 生成
      </span>

      {isVideo && (
        <span className="absolute inset-0 grid place-items-center pointer-events-none">
          <span className="w-9 h-9 rounded-full bg-black/45 backdrop-blur-sm grid place-items-center text-white">
            <PlayIcon />
          </span>
        </span>
      )}

      {/* hover:设为参考图(仅图片 — 视频不能作图像参考)*/}
      {!isVideo && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onSetReference(tile.url);
          }}
          title="设为参考图"
          aria-label="设为参考图"
          className="absolute right-1.5 top-1.5 w-7 h-7 rounded-md bg-white text-text shadow-md grid place-items-center opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-white transition"
        >
          <RefIcon />
        </button>
      )}
    </div>
  );
}

function ScopeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-7 px-3 rounded text-small transition " +
        (active ? "bg-card text-text font-medium shadow-sm" : "text-text-2 hover:text-text")
      }
    >
      {children}
    </button>
  );
}

function KindTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-8 px-3 border-b-2 text-sub transition " +
        (active ? "border-primary text-primary font-medium" : "border-transparent text-text-2 hover:text-text")
      }
    >
      {children}
    </button>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-3 shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function RefIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-4 4" />
      <path d="M16 3v6M13 6h6" />
    </svg>
  );
}
