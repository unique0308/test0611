"use client";

// 生成中加载卡 — 与 ResultFeedItem 同结构(2026-05-20 嘉斌确认):
//   prompt + meta chips 头部  →  灰暗加载块(按所选比例占位)  →  正在生成… + 取消 底部
// 出图后整卡被 ResultFeedItem 无缝替换,布局不跳。
// 加载块:深色 + 整块明暗"呼吸"(animate-breathe),克制不抢眼,不是旧的大灰块加载页。

import type { Kind, Ratio } from "@/components/generate/types";

type Props = {
  kind: Kind;
  ratio: Ratio;
  count?: 1 | 2 | 4;
  durationSeconds?: 5 | 10;
  modelName?: string;
  prompt?: string;
  purposeTagName?: string;
  taskId?: string | null;
  // 失败态:errorMessage 非空时图片区切红框,footer 改成 关闭/重试
  errorMessage?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
};

export function SkeletonResult(props: Props) {
  const isVideo = props.kind === "video";
  const count = props.count ?? 1;
  const multi = !isVideo && count > 1;
  const timeHint = isVideo ? "约 30s–3min" : "约 10–30s";
  const failed = !!props.errorMessage;

  return (
    <article className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden animate-result-in">
      {/* Header — 与 ResultFeedItem 一致:prompt + meta chips */}
      <div className="px-5 pt-4 pb-3 border-b border-border bg-bg/30">
        {props.prompt && (
          <p className="text-body text-text leading-relaxed whitespace-pre-wrap">{props.prompt}</p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {props.modelName && <ModelChip>{props.modelName}</ModelChip>}
          <Chip>{props.ratio}</Chip>
          {isVideo
            ? <Chip>{props.durationSeconds ?? 5}s</Chip>
            : count > 1 && <Chip>{count} 张</Chip>}
          {props.purposeTagName && <SubtleChip>{props.purposeTagName}</SubtleChip>}
          <span className="ml-auto text-cap text-text-3 num">刚刚</span>
        </div>
      </div>

      {/* Body — 失败时:红框 + 错误文案;否则:灰暗加载块按比例占位 */}
      <div className="p-5">
        {failed ? (
          <div
            className="rounded-xl border border-danger/40 bg-danger-soft grid place-items-center shadow-sm"
            style={{
              width: isVideo ? 480 : 340,
              maxWidth: "100%",
              aspectRatio: props.ratio.replace(":", "/"),
              maxHeight: "44vh"
            }}
          >
            <div className="flex flex-col items-center gap-2 px-5 text-center">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              <span className="text-sub font-medium text-danger">生成失败</span>
              <span className="text-cap text-danger/80 leading-relaxed break-all">
                {props.errorMessage}
              </span>
            </div>
          </div>
        ) : multi ? (
          <div className="grid grid-cols-2 gap-2" style={{ maxWidth: 420 }}>
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg bg-text grid place-items-center animate-breathe"
                style={{ animationDelay: `${i * 0.22}s` }}
              >
                <Spinner size={22} />
              </div>
            ))}
          </div>
        ) : (
          <div
            className="rounded-xl bg-text grid place-items-center animate-breathe shadow-sm"
            style={{
              width: isVideo ? 480 : 340,
              maxWidth: "100%",
              aspectRatio: props.ratio.replace(":", "/"),
              maxHeight: "44vh"
            }}
          >
            <div className="flex flex-col items-center gap-2 text-white/85">
              <Spinner size={28} />
              <span className="text-cap font-medium">生成中…</span>
              <span className="text-[11px] text-white/55 num">{timeHint}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer — 失败:关闭/重试;成功中:正在生成… + 取消 */}
      <div className="px-5 pb-4 -mt-1 flex items-center gap-2.5">
        {failed ? (
          <>
            <span className="text-sub text-danger">生成失败,可重试</span>
            <div className="ml-auto flex items-center gap-2">
              {props.onDismiss && (
                <button
                  type="button"
                  onClick={props.onDismiss}
                  className="h-8 px-3 rounded-md border border-border text-cap text-text-2 hover:bg-bg transition"
                >
                  关闭
                </button>
              )}
              {props.onRetry && (
                <button
                  type="button"
                  onClick={props.onRetry}
                  className="h-8 px-3 rounded-md bg-primary text-white text-cap hover:opacity-90 transition"
                >
                  重试
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="text-sub text-text-2">正在生成…</span>
            {props.taskId && (
              <span className="text-cap text-text-3 num">#{props.taskId.slice(0, 8)}</span>
            )}
          </>
        )}
      </div>
    </article>
  );
}

// ─── Sub components ───────────────────────────────────────────────────────

function Spinner({ size }: { size: number }) {
  return (
    <span
      className="border-2 border-white/25 border-t-white rounded-full animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

// 下面三个 chip 与 ResultFeedItem 的 MetaChip 视觉一致,保证加载卡 → 结果卡 头部无缝
function ModelChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-cap bg-primary-soft text-primary-ink font-medium">
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-7-7M5 12a7 7 0 0 0 7 7" />
      </svg>
      {children}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-cap bg-bg text-text-2 border border-border num">
      {children}
    </span>
  );
}

function SubtleChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-cap bg-violet-soft text-violet">
      {children}
    </span>
  );
}
