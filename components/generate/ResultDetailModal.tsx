"use client";

// 结果详情弹层 — 点击 feed 卡缩略图打开
// 规范来源:设计参考.md §4.5.4(与资产页 HistoryDetailModal 同款)
// 布局:暗色 lightbox,左大图 max-h-[84vh] 留余白 + 右侧 340px 暗色信息面板
// 生成页专属差异:"重新生成"走 onReuse 回填 dock(不跳路径)
//
// ⚠️ 必须用 createPortal 渲染到 body:父级 ResultFeedItem 在 isLatest 时挂 animate-result-in,
// keyframes 用 transform 且 animation-fill-mode: both → 终态 transform 保留,
// 嵌套渲染会让 fixed inset-0 被困在卡片内(CSS spec:transformed ancestor 成为 fixed 的 containing block)。

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { FeedItem } from "@/components/generate/types";

type Output = { url: string; type: string; idx: number };

type Props = {
  item: FeedItem;
  outputs: Output[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
  onReuse: (item: FeedItem) => void;
};

export function ResultDetailModal({ item, outputs, index, onClose, onIndexChange, onReuse }: Props) {
  const [promptHover, setPromptHover] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && outputs.length > 1) {
        onIndexChange((index - 1 + outputs.length) % outputs.length);
      }
      if (e.key === "ArrowRight" && outputs.length > 1) {
        onIndexChange((index + 1) % outputs.length);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, outputs.length, onClose, onIndexChange]);

  if (outputs.length === 0) return null;
  if (!mounted) return null;
  const safeIdx = ((index % outputs.length) + outputs.length) % outputs.length;
  const current = outputs[safeIdx];
  const isVideo = item.type === "video" || (current.type ?? "").startsWith("video");

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex gap-4 p-4 sm:p-6"
      style={{ background: "rgba(10,12,18,.93)", backdropFilter: "blur(4px)" }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute left-5 top-5 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition"
      >
        <CloseIcon />
      </button>

      {/* 媒体区:max-h-[84vh] 留余白,保证整图完整可见 */}
      <div onClick={e => e.stopPropagation()} className="flex-1 min-w-0 grid place-items-center">
        {isVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={current.url}
            controls
            className="max-w-full max-h-[84vh] rounded-lg shadow-2xl bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt={item.prompt.slice(0, 40)}
            className="max-w-full max-h-[84vh] object-contain rounded-lg shadow-2xl"
          />
        )}
      </div>

      {/* 信息面板:340px 暗色 */}
      <div
        onClick={e => e.stopPropagation()}
        className="w-[340px] shrink-0 rounded-xl flex flex-col overflow-hidden"
        style={{ background: "#202229" }}
      >
        {/* 操作栏:下载 + 重新生成 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <a
            href={current.url}
            download
            className="h-9 px-4 rounded-md bg-white text-[#1A1D24] text-small font-medium inline-flex items-center gap-1.5 hover:bg-white/90 transition"
          >
            <DownloadIcon />
            下载
          </a>
          <button
            type="button"
            onClick={() => {
              onReuse(item);
              onClose();
            }}
            className="ml-auto h-9 px-3 rounded-md text-small text-white/80 inline-flex items-center gap-1.5 border border-white/15 hover:bg-white/10 hover:text-white transition"
          >
            <RefreshIcon />
            重新生成
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 同任务缩略图条(多图任务才显示) */}
          {outputs.length > 1 && (
            <div className="px-4 py-3 border-b border-white/10">
              <div className="flex flex-wrap gap-2">
                {outputs.map((o, i) => (
                  <button
                    type="button"
                    key={o.idx}
                    onClick={() => onIndexChange(i)}
                    aria-label={`第 ${i + 1} 张`}
                    className={
                      "w-14 h-14 rounded-md overflow-hidden border-2 transition " +
                      (i === safeIdx ? "border-white" : "border-transparent opacity-60 hover:opacity-100")
                    }
                  >
                    {isVideo ? (
                      <span className="w-full h-full grid place-items-center bg-violet/40 text-white">
                        <PlayIcon />
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.url} alt="" className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Prompt 区:hover 浮出 复制 */}
          <div
            className="px-4 py-3"
            onMouseEnter={() => setPromptHover(true)}
            onMouseLeave={() => setPromptHover(false)}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[20px]">
              <span className="text-chip text-white/45">{isVideo ? "视频提示词" : "图片提示词"}</span>
              <button
                type="button"
                onClick={copyPrompt}
                className={
                  "text-chip text-white/55 hover:text-white inline-flex items-center gap-1 transition-opacity " +
                  (promptHover ? "opacity-100" : "opacity-0")
                }
              >
                <CopyIcon />
                {copied ? "已复制" : "复制"}
              </button>
            </div>
            <p className="text-sub text-white/85 leading-relaxed whitespace-pre-wrap">{item.prompt}</p>
          </div>

          {/* 元数据 */}
          <dl className="px-4 pb-4 grid grid-cols-2 gap-x-3 gap-y-2.5">
            <Meta k="类型" v={isVideo ? "视频" : "图片"} />
            <Meta k="状态" v={statusLabel(item.status)} />
            <Meta k="模型" v={item.model_name || "—"} />
            <Meta
              k={isVideo ? "时长 / 比例" : "比例"}
              v={
                isVideo && item.duration_seconds != null
                  ? `${item.duration_seconds}s · ${item.ratio || "—"}`
                  : item.ratio || "—"
              }
            />
            <Meta k="使用目的" v={item.purpose_tag_name || "—"} />
            {outputs.length > 1 && <Meta k="出图数量" v={`${outputs.length} 张`} />}
            <Meta k="生成时间" v={formatTime(item.created_at)} />
            {item.credits_cost != null && <Meta k="消耗积分" v={String(item.credits_cost)} />}
          </dl>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-chip text-white/40">{k}</dt>
      <dd className="text-sub text-white/85 truncate" title={v}>
        {v}
      </dd>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "succeeded": return "已完成";
    case "failed": return "已失败";
    case "running": return "生成中";
    case "queued": return "排队中";
    case "cancelled": return "已取消";
    default: return status;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12" />
      <path d="M6 12l6 6 6-6" />
      <path d="M4 20h16" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
