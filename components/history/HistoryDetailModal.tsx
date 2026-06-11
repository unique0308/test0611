"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type HistoryRow, formatFullTime, statusLabel, encodePrefill } from "./types";

// 历史作品详情弹层(2026-05-21 重塑;2026-05-22:收藏移到画廊瓦片,弹层内只留复制)
// 暗色 lightbox:左大图(可切换)+ 右信息面板

type Props = {
  task: HistoryRow;
  initialIndex: number; // task.outputs 数组下标
  onClose: () => void;
};

export function HistoryDetailModal({ task, initialIndex, onClose }: Props) {
  const outputs = task.outputs;
  const succeeded = task.status === "succeeded" && outputs.length > 0;
  const isVideo = task.type === "video";

  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, outputs.length - 1))
  );
  const current = succeeded ? outputs[index] : null;

  const [promptHover, setPromptHover] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (succeeded && outputs.length > 1) {
        if (e.key === "ArrowLeft") setIndex(i => (i - 1 + outputs.length) % outputs.length);
        if (e.key === "ArrowRight") setIndex(i => (i + 1) % outputs.length);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, succeeded, outputs.length]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(task.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex gap-4 p-4 sm:p-6"
      style={{ background: "rgba(10,12,18,.93)", backdropFilter: "blur(4px)" }}
    >
      {/* 关闭 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute left-5 top-5 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition"
      >
        <CloseIcon />
      </button>

      {/* 媒体区 */}
      <div onClick={e => e.stopPropagation()} className="flex-1 min-w-0 grid place-items-center">
        {current && current.file_url && !isVideo && (
          // eslint-disable-next-line @next/next/no-img-element
          // 留出余白,保证整图完整可见(不贴满视口)
          <img
            src={current.file_url}
            alt={task.prompt}
            className="max-w-full max-h-[84vh] object-contain rounded-lg shadow-2xl"
          />
        )}
        {current && current.file_url && isVideo && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={current.file_url} controls className="max-w-full max-h-[84vh] rounded-lg shadow-2xl bg-black" />
        )}
        {!current && (
          <div className="text-white/50 text-body">
            {task.status === "failed" ? "该任务生成失败,无结果文件" : "暂无结果文件"}
          </div>
        )}
      </div>

      {/* 信息面板 */}
      <div
        onClick={e => e.stopPropagation()}
        className="w-[340px] shrink-0 rounded-xl flex flex-col overflow-hidden"
        style={{ background: "#202229" }}
      >
        {/* 操作栏:下载 + 重新生成 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          {succeeded && current?.file_url && (
            <a
              href={current.file_url}
              download
              className="h-9 px-4 rounded-md bg-white text-[#1A1D24] text-small font-medium inline-flex items-center gap-1.5 hover:bg-white/90 transition"
            >
              <DownloadIcon />
              下载
            </a>
          )}
          <Link
            href={`/?prefill=${encodePrefill(task)}`}
            className="ml-auto h-9 px-3 rounded-md text-small text-white/80 inline-flex items-center gap-1.5 border border-white/15 hover:bg-white/10 hover:text-white transition"
          >
            <RefreshIcon />
            重新生成
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 同任务缩略图条(多图任务才显示)*/}
          {succeeded && outputs.length > 1 && (
            <div className="px-4 py-3 border-b border-white/10">
              <div className="flex flex-wrap gap-2">
                {outputs.map((o, i) => (
                  <button
                    type="button"
                    key={o.output_index}
                    onClick={() => setIndex(i)}
                    aria-label={`第 ${i + 1} 张`}
                    className={
                      "w-14 h-14 rounded-md overflow-hidden border-2 transition " +
                      (i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100")
                    }
                  >
                    {o.file_url && !isVideo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.file_url} alt="" className="w-full h-full object-cover" />
                    )}
                    {isVideo && (
                      <span className="w-full h-full grid place-items-center bg-violet/40 text-white">
                        <PlayIcon />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Prompt:hover 时右上角浮出 收藏 / 复制 */}
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
            <p className="text-sub text-white/85 leading-relaxed whitespace-pre-wrap">{task.prompt}</p>
          </div>

          {/* 元数据 */}
          <dl className="px-4 pb-4 grid grid-cols-2 gap-x-3 gap-y-2.5">
            <Meta k="类型" v={isVideo ? "视频" : "图片"} />
            <Meta k="状态" v={statusLabel(task.status)} />
            <Meta k="模型" v={task.model_name} />
            <Meta
              k={isVideo ? "时长 / 比例" : "比例"}
              v={isVideo && task.duration_seconds ? `${task.duration_seconds}s · ${task.ratio}` : task.ratio}
            />
            <Meta k="使用目的" v={task.purpose_tag_name} />
            {succeeded && outputs.length > 1 && <Meta k="出图数量" v={`${outputs.length} 张`} />}
            <Meta k="生成时间" v={formatFullTime(task.created_at)} />
          </dl>
        </div>
      </div>
    </div>
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
