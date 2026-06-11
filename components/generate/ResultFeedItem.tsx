"use client";

// 单条生成结果卡 — 对话框上方 feed 的基本单元
// 视觉(对照截图):
//   prompt 全文(可展开/折叠) → 元数据 chip 行(模型/比例/张数/使用目的)→ 图片区(单张大 / 多张网格)→ 操作行(收藏/重生成 + 消耗积分)
//   图片 hover 显示工具栏(下载 / 放大);多图按张数分 grid;视频用原生 <video> 控件

import { useMemo, useState } from "react";
import { StarButton } from "@/components/prompts/StarButton";
import { Lightbox } from "@/components/generate/Lightbox";
import { ResultDetailModal } from "@/components/generate/ResultDetailModal";
import { type FeedItem } from "@/components/generate/types";

type Props = {
  item: FeedItem;
  // 收藏映射(同 history page 的 collectionMap):task_id → collection_id
  collectionId?: number | null;
  onReuse: (item: FeedItem) => void;
  // 顶部加 "刚刚 / N 分钟前" 相对时间;props.isLatest=true 时显示新进入动画
  isLatest?: boolean;
};

const PROMPT_PREVIEW_CHARS = 220;

export function ResultFeedItem({ item, collectionId, onReuse, isLatest }: Props) {
  const [expandPrompt, setExpandPrompt] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [refLightbox, setRefLightbox] = useState(false);

  const outputs = useMemo<Array<{ url: string; idx: number; type: string }>>(() => {
    if (item.outputs && item.outputs.length > 0) {
      return item.outputs.map(o => ({ url: o.file_url, idx: o.output_index, type: o.file_type }));
    }
    if (item.file_url) {
      return [{ url: item.file_url, idx: 0, type: item.file_type ?? "" }];
    }
    return [];
  }, [item]);

  const isVideo = item.type === "video";
  const ok = item.status === "succeeded" && outputs.length > 0;
  const longPrompt = item.prompt.length > PROMPT_PREVIEW_CHARS;
  const promptShown = expandPrompt || !longPrompt
    ? item.prompt
    : item.prompt.slice(0, PROMPT_PREVIEW_CHARS) + "…";

  return (
    <article
      className={
        "bg-card border border-border rounded-2xl shadow-sm overflow-hidden " +
        (isLatest ? "animate-result-in" : "")
      }
    >
      {/* Header:prompt + meta chips */}
      <div className="px-5 pt-4 pb-3 border-b border-border bg-bg/30">
        <p
          className="text-body text-text leading-relaxed whitespace-pre-wrap"
          title={item.prompt}
        >
          {promptShown}
          {longPrompt && (
            <button
              type="button"
              onClick={() => setExpandPrompt(e => !e)}
              className="ml-2 text-cap text-primary hover:text-primary-ink"
            >
              {expandPrompt ? "收起" : "展开"}
            </button>
          )}
        </p>

        {/* 参考图:prompt 下方小预览(图生图 / 图生视频),点击放大 */}
        {item.reference_image_url && (
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRefLightbox(true)}
              className="group/ref relative w-12 h-12 rounded-lg overflow-hidden border border-border bg-bg shrink-0"
              title="查看参考图"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.reference_image_url}
                alt="参考图"
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover/ref:bg-black/30 text-white opacity-0 group-hover/ref:opacity-100 transition">
                <ZoomIcon />
              </span>
            </button>
            <span className="inline-flex items-center gap-1 text-cap text-text-3">
              <RefIcon />
              参考图
            </span>
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <MetaChip type="model">{item.model_name || "—"}</MetaChip>
          <MetaChip>{item.ratio}</MetaChip>
          {isVideo
            ? <MetaChip>{item.duration_seconds ?? 5}s</MetaChip>
            : outputs.length > 1 && <MetaChip>{outputs.length} 张</MetaChip>
          }
          {item.purpose_tag_name && <MetaChip subtle>{item.purpose_tag_name}</MetaChip>}
          <span className="ml-auto text-cap text-text-3 num">{formatRelative(item.created_at)}</span>
        </div>
      </div>

      {/* Body:图片/视频 — 左对齐 + 限制大小,确保完整图可见不需滚动 */}
      <div className="p-5">
        {!ok ? (
          <FailurePlaceholder status={item.status} />
        ) : isVideo ? (
          <video
            src={outputs[0].url}
            controls
            className="rounded-xl bg-bg block shadow-sm"
            style={{ maxHeight: "50vh", maxWidth: "560px" }}
          />
        ) : outputs.length === 1 ? (
          <div className="inline-block relative group align-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={outputs[0].url}
              alt={item.prompt.slice(0, 40)}
              loading="lazy"
              onClick={() => setLightboxIdx(0)}
              className="rounded-xl bg-bg shadow-sm cursor-zoom-in object-contain"
              style={{ maxHeight: "40vh", maxWidth: "340px" }}
            />
            <ImageHoverActions
              fileUrl={outputs[0].url}
              onZoom={() => setLightboxIdx(0)}
            />
          </div>
        ) : (
          <div
            className="grid grid-cols-2 gap-2"
            style={{ maxWidth: "420px" }}
          >
            {outputs.map((o, i) => (
              <div key={o.idx} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={o.url}
                  alt={`${item.prompt.slice(0, 30)} ${i + 1}`}
                  loading="lazy"
                  onClick={() => setLightboxIdx(i)}
                  className="w-full h-auto object-contain rounded-lg bg-bg cursor-zoom-in"
                />
                <ImageHoverActions
                  fileUrl={o.url}
                  onZoom={() => setLightboxIdx(i)}
                />
                <span className="absolute top-1.5 left-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-black/40 text-white text-[10px] font-medium num backdrop-blur-sm">
                  {i + 1}/{outputs.length}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer:操作 + 积分消耗 */}
      <div className="px-5 pb-4 -mt-1 flex flex-wrap items-center gap-2">
        {ok && (
          <>
            <StarButton taskId={item.id} collectionId={collectionId ?? null} size="sm" />
            <FooterBtn
              onClick={() => onReuse(item)}
              icon={<RegenIcon />}
              label="重新生成"
            />
            <FooterBtn
              as="a"
              href={outputs[0].url}
              download
              icon={<DownloadIcon />}
              label={outputs.length > 1 ? "下载主图" : "下载"}
            />
          </>
        )}
        {item.credits_cost != null && (
          <span className="ml-auto text-cap text-text-3">
            消耗 <span className="num text-text-2">{item.credits_cost}</span> 积分
          </span>
        )}
      </div>

      {lightboxIdx !== null && outputs.length > 0 && (
        <ResultDetailModal
          item={item}
          outputs={outputs.map(o => ({ url: o.url, type: o.type, idx: o.idx }))}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onIndexChange={setLightboxIdx}
          onReuse={onReuse}
        />
      )}

      {refLightbox && item.reference_image_url && (
        <Lightbox
          images={[{ url: item.reference_image_url, alt: "参考图" }]}
          index={0}
          onClose={() => setRefLightbox(false)}
          onIndexChange={() => {}}
        />
      )}
    </article>
  );
}

// ─── Sub components ───────────────────────────────────────────────────────

function MetaChip({
  children,
  type,
  subtle
}: {
  children: React.ReactNode;
  type?: "model";
  subtle?: boolean;
}) {
  if (type === "model") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-cap bg-primary-soft text-primary-ink font-medium">
        <ModelIcon />
        {children}
      </span>
    );
  }
  if (subtle) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-cap bg-violet-soft text-violet">
        {children}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-cap bg-bg text-text-2 border border-border num">
      {children}
    </span>
  );
}

function ImageHoverActions({
  fileUrl,
  onZoom
}: {
  fileUrl: string;
  onZoom: () => void;
}) {
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
      <button
        type="button"
        onClick={onZoom}
        className="w-8 h-8 rounded-md bg-black/50 hover:bg-black/70 text-white grid place-items-center backdrop-blur-sm"
        title="放大"
      >
        <ZoomIcon />
      </button>
      <a
        href={fileUrl}
        download
        onClick={e => e.stopPropagation()}
        className="w-8 h-8 rounded-md bg-black/50 hover:bg-black/70 text-white grid place-items-center backdrop-blur-sm"
        title="下载"
      >
        <DownloadIcon />
      </a>
    </div>
  );
}

type FooterBtnProps = {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
} & (
  | { as?: "button" }
  | { as: "a"; href: string; download?: boolean }
);

function FooterBtn(props: FooterBtnProps) {
  const cls =
    "h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-sub text-text-2 hover:text-primary hover:bg-primary-soft transition border border-transparent hover:border-primary/30";
  if (props.as === "a") {
    return (
      <a href={props.href} download={props.download} className={cls}>
        {props.icon}
        {props.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={props.onClick} className={cls}>
      {props.icon}
      {props.label}
    </button>
  );
}

function FailurePlaceholder({ status }: { status: string }) {
  const text =
    status === "failed" ? "生成失败" :
    status === "cancelled" ? "已取消" :
    "无结果";
  return (
    <div className="aspect-[3/2] grid place-items-center bg-bg/60 rounded-xl border border-dashed border-border-strong text-text-3 text-sub">
      {text}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────

function ModelIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-7-7M5 12a7 7 0 0 0 7 7" />
    </svg>
  );
}

function RefIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4M9 11h4M11 9v4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12M6 12l6 6 6-6M5 20h14" />
    </svg>
  );
}

function RegenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v6h6M20 20v-6h-6" />
      <path d="M20 9A8 8 0 0 0 5.6 5.6M4 15a8 8 0 0 0 14.4 3.4" />
    </svg>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
