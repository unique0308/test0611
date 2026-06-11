"use client";

import { useState } from "react";
import Link from "next/link";
import { StarButton } from "@/components/prompts/StarButton";
import { type HistoryRow, formatTime, encodePrefill } from "./types";

// 历史页列表视图(2026-05-21 重塑,沿用原型 history.html 表格 + 选择模式)

type Props = {
  rows: HistoryRow[];
  loading: boolean;
  selectMode: boolean;
  selected: Set<string>;
  allSelectedOnPage: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpen: (row: HistoryRow) => void;
  onStarChange: (id: string, cid: number | null) => void;
  emptyHint: React.ReactNode;
};

export function HistoryList(props: Props) {
  const { rows, loading, selectMode, selected } = props;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-body">
        <thead>
          <tr className="text-sub text-text-2 bg-bg/60 border-b border-border">
            {selectMode && (
              <th className="px-4 py-3 w-[44px]">
                <input
                  type="checkbox"
                  checked={props.allSelectedOnPage}
                  onChange={props.onToggleSelectAll}
                  className="w-4 h-4 accent-primary align-middle"
                />
              </th>
            )}
            <th className="text-left px-5 py-3 font-medium" style={{ width: "44%" }}>作品 / Prompt</th>
            <th className="text-left px-3 py-3 font-medium w-[88px]">类型</th>
            <th className="text-left px-3 py-3 font-medium w-[150px]">模型</th>
            <th className="text-left px-3 py-3 font-medium w-[120px]">使用目的</th>
            <th className="text-left px-3 py-3 font-medium w-[120px]">生成时间</th>
            {!selectMode && <th className="text-right px-5 py-3 font-medium w-[120px]">操作</th>}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={6} className="text-center text-text-3 py-14">加载中…</td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-text-3 py-16">{props.emptyHint}</td>
            </tr>
          )}
          {!loading &&
            rows.map(r => {
              const succeeded = r.status === "succeeded";
              return (
                <tr
                  key={r.id}
                  onClick={() => {
                    if (selectMode) {
                      props.onToggleSelect(r.id);
                    } else {
                      props.onOpen(r);
                    }
                  }}
                  className={
                    "group border-t border-border cursor-pointer " +
                    (selected.has(r.id) ? "bg-primary-soft/40" : "hover:bg-bg/40")
                  }
                >
                  {selectMode && (
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => props.onToggleSelect(r.id)}
                        className="w-4 h-4 accent-primary align-middle"
                      />
                    </td>
                  )}
                  <td className="px-5 py-3 relative">
                    <div className="flex items-start gap-3">
                      <ListThumb row={r} />
                      <div className="min-w-0 flex-1">
                        <p className="text-body text-text line-clamp-2 leading-snug" title={r.prompt}>
                          {r.prompt}
                        </p>
                        <p className="text-cap text-text-3 mt-1 truncate">
                          {r.type === "video"
                            ? `${r.duration_seconds ? r.duration_seconds + "s · " : ""}${r.ratio}`
                            : `${r.outputs.length > 1 ? r.outputs.length + " 张 · " : ""}${r.ratio}`}
                        </p>
                      </div>
                    </div>
                    {/* hover 行时右上角浮出「复制 Prompt」 */}
                    {!selectMode && (
                      <div className="absolute top-2 right-3 opacity-0 group-hover:opacity-100 transition">
                        <RowCopyButton text={r.prompt} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <KindBadge kind={r.type} />
                  </td>
                  <td className="px-3 py-3 text-small text-text-2 truncate">{r.model_name}</td>
                  <td className="px-3 py-3">
                    <PurposeBadge name={r.purpose_tag_name} />
                  </td>
                  <td className="px-3 py-3 text-small text-text-3 num">{formatTime(r.created_at)}</td>
                  {!selectMode && (
                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {succeeded && (
                          <StarButton
                            taskId={r.id}
                            collectionId={r.collection_id}
                            onChange={cid => props.onStarChange(r.id, cid)}
                          />
                        )}
                        <Link
                          href={`/?prefill=${encodePrefill(r)}`}
                          title="重新生成"
                          aria-label="重新生成"
                          className="inline-flex items-center justify-center w-7 h-7 rounded text-text-2 hover:text-primary hover:bg-primary-soft transition"
                        >
                          <RefreshIcon />
                        </Link>
                        {succeeded && r.file_url && (
                          <a
                            href={r.file_url}
                            download
                            title="下载"
                            aria-label="下载"
                            className="inline-flex items-center justify-center w-7 h-7 rounded text-text-2 hover:text-primary hover:bg-primary-soft transition"
                          >
                            <DownloadIcon />
                          </a>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

function ListThumb({ row }: { row: HistoryRow }) {
  if (row.status !== "succeeded" || !row.file_url) {
    return (
      <div className="w-14 h-14 rounded-sm bg-bg flex items-center justify-center text-text-3 text-small shrink-0">
        {row.status === "failed" ? "失败" : "—"}
      </div>
    );
  }
  if (row.type === "video") {
    return (
      <div className="w-14 h-14 rounded-sm bg-violet-soft text-violet flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={row.file_url}
      alt="缩略图"
      className="w-14 h-14 object-cover rounded-sm bg-bg shrink-0"
      loading="lazy"
    />
  );
}

function KindBadge({ kind }: { kind: "image" | "video" }) {
  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 rounded-sm text-chip " +
        (kind === "image" ? "bg-primary-soft text-primary" : "bg-violet-soft text-violet")
      }
    >
      {kind === "image" ? "图片" : "视频"}
    </span>
  );
}

function PurposeBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-chip bg-bg text-text-2 border border-border">
      {name}
    </span>
  );
}

// hover 行时浮出的「复制 Prompt」按钮(自带 1.5s「已复制」回显)
function RowCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async e => {
        e.stopPropagation(); // 不触发行点击(打开详情)
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* 剪贴板不可用时静默 */
        }
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-card border border-border text-cap text-text-2 shadow-sm hover:text-primary hover:border-primary/40 transition"
    >
      <CopyIcon />
      {copied ? "已复制" : "复制 Prompt"}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12" />
      <path d="M6 12l6 6 6-6" />
      <path d="M4 20h16" />
    </svg>
  );
}
