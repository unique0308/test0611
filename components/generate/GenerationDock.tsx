"use client";

// 生成对话框 — 支持 hero(居中大卡)/ docked(常驻底部)/ maximized(全屏 overlay)三种 variant
// hero:首次进入、无任何历史时,占据视窗中央,带欢迎标题 + 示例 prompt
// docked:有结果时,由 DockedLayout 渲染在常驻底部的 dock 区(collapsed 展开后的完整形态)
// maximized:用户点右上角 ⤢ 按钮触发,打开 overlay 让长 prompt 全屏编辑
//
// 内部布局相同:Tabs(图片/视频)→ Prompt textarea(固定高度,内部滚动)→ 参考图卡 → param-bar
//
// 交互:
//   - ⌘↵ / Ctrl↵ 提交(textarea 内 keydown)
//   - 参考图卡:点击或拖拽上传(对齐设计参考 §4.1.4 "拖拽或点击")
//   - 视频 Tab:文案改为"图生视频:首帧将复刻参考图(可选)",不再误导 @ 引用
//   - 使用目的 / 数量 / 时长:用 ParamSelect 替代原生 select
//   - textarea 高度固定(根据 variant),内容超出走内部滚动 — 防止 dock 因 prompt 长度而抖动

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ModelRow, PurposeTagRow } from "@/lib/db/queries";
import { ParamSelect } from "@/components/generate/ParamSelect";
import { PopoverParam } from "@/components/generate/ParamPopover";
import { SubmitPill } from "@/components/generate/SubmitPill";
import {
  RATIOS,
  VIDEO_RATIOS,
  ratioGlyphSize,
  type Kind,
  type Ratio,
  type ReferenceImage
} from "@/components/generate/types";
import { getRatioSupport, RATIO_SUPPORT_LABEL, LIMITED_RATIOS } from "@/lib/easyrouter/ratio-support";

type Variant = "hero" | "docked" | "maximized";

type Props = {
  variant: Variant;
  kind: Kind;
  prompt: string;
  ratio: Ratio;
  purposeTagId: string;
  purposeTags: PurposeTagRow[];
  // 024 · M5 P1 波 2:当前 conv 主标签(NULL=未选,SubmitPill disabled + label 提示)
  primaryPurposeTagId: string | null;
  // 025 · M5 P1 波 3:"其他"id(active 池 name_normalized='other_v2') + optional <20 字 note
  otherPurposeTagId: string | null;
  otherNote: string;
  onOtherNoteChange: (value: string) => void;
  currentModels: ModelRow[];
  currentModelId: string;
  referenceImage: ReferenceImage | null;
  outputCount: 1 | 2 | 4;
  duration: 5 | 10;
  loading: boolean;
  noModels: boolean;
  newTagInputOpen: boolean;
  newTagDraft: string;
  newTagSubmitting: boolean;
  newTagError: string | null;
  // 余额信息(显示在生成按钮旁,匹配截图右下 ⚡ pill)
  usedCredits: number;
  limitCredits: number;
  quotaWarning: "green" | "yellow" | "red";
  onSubmit: (e: React.FormEvent) => void;
  onKindChange: (kind: Kind) => void;
  onPromptChange: (value: string) => void;
  onRatioChange: (ratio: Ratio) => void;
  onPurposeTagChange: (id: string) => void;
  onModelChange: (modelId: string) => void;
  onReferenceUpload: (file: File) => void;
  onReferenceRemove: () => void;
  onOutputCountChange: (value: 1 | 2 | 4) => void;
  onDurationChange: (value: 5 | 10) => void;
  onClear: () => void;
  onCreateTag: () => void;
  onNewTagDraftChange: (value: string) => void;
  onNewTagInputOpenChange: (open: boolean) => void;
  onNewTagErrorClear: () => void;
  // 右上角放大/收起切换;不传则不显示按钮
  onToggleMaximize?: () => void;
  // 右上角折叠按钮;不传则不显示(hero / maximized 不需要)
  onMinimize?: () => void;
};

export function GenerationDock(props: Props) {
  const isVideo = props.kind === "video";
  const selectedModel = props.currentModels.find(m => m.id === props.currentModelId);

  // ⌘↵ 快捷键 — textarea 内捕获,转发给 form
  const formRef = useRef<HTMLFormElement | null>(null);
  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const remainCredits = Math.max(props.limitCredits - props.usedCredits, 0);

  // 整个 dock 接受图片拖放 —— 不必精确拖到「图片」框内,拖到输入区任意位置即识别
  const [dockDragOver, setDockDragOver] = useState(false);
  function onDockDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      if (!dockDragOver) setDockDragOver(true);
    }
  }
  function onDockDragLeave(e: React.DragEvent) {
    // 仅当真正离开 form(而非进入子元素)时取消高亮
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDockDragOver(false);
  }
  function onDockDrop(e: React.DragEvent) {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDockDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f.type.startsWith("image/")) props.onReferenceUpload(f);
  }

  // 容器样式因 variant 而异;maximized 走全屏 flex column,textarea 撑开
  const wrapClass =
    props.variant === "maximized"
      ? "bg-card rounded-2xl shadow-md border border-border overflow-hidden flex flex-col h-full"
      : props.variant === "hero"
        ? "bg-card rounded-3xl shadow-md border border-border overflow-hidden"
        : "bg-card rounded-2xl shadow-dock border border-border-strong overflow-hidden";

  // textarea 固定高度 — 防 prompt 长短引起 dock 抖动
  // hero 给较多空间(120px);docked 紧凑(80px);maximized 自适应 flex-1
  const textareaHeightClass =
    props.variant === "maximized"
      ? "flex-1 min-h-[200px]"
      : props.variant === "hero"
        ? "h-[120px]"
        : "h-[80px]";

  const isMaximized = props.variant === "maximized";

  return (
    <form
      ref={formRef}
      onSubmit={props.onSubmit}
      onDragOver={onDockDragOver}
      onDragLeave={onDockDragLeave}
      onDrop={onDockDrop}
      className={wrapClass + (dockDragOver ? " ring-2 ring-success" : "")}
    >
      {/* Tabs + 右上角 maximize/shrink — V2 滑块式 pill：切换时 indicator 滑动 + 内容淡入 */}
      <div className="flex items-center justify-between gap-4 px-4">
        <KindSwitcher kind={props.kind} onChange={props.onKindChange} />
        {(props.onMinimize || props.onToggleMaximize) && (
          <div className="flex items-center gap-1">
            {props.onMinimize && !isMaximized && (
              <button
                type="button"
                onClick={props.onMinimize}
                title="折叠"
                aria-label="折叠"
                className="w-8 h-8 rounded-md text-text-3 hover:bg-bg hover:text-primary inline-flex items-center justify-center transition"
              >
                <MinimizeIcon />
              </button>
            )}
            {props.onToggleMaximize && (
              <button
                type="button"
                onClick={props.onToggleMaximize}
                title={isMaximized ? "收起" : "放大编辑"}
                aria-label={isMaximized ? "收起" : "放大编辑"}
                className="w-8 h-8 rounded-md text-text-3 hover:bg-bg hover:text-primary inline-flex items-center justify-center transition"
              >
                {isMaximized ? <ShrinkIcon /> : <ExpandIcon />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Prompt — 固定高度,内部滚动 */}
      <div className={isMaximized ? "px-7 pt-5 flex-1 flex flex-col min-h-0" : props.variant === "hero" ? "px-7 pt-6" : "px-6 pt-5"}>
        <textarea
          value={props.prompt}
          onChange={e => props.onPromptChange(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          maxLength={1000}
          placeholder={
            isVideo
              ? "描述你想生成的视频,例如「营销短视频:产品旋转展示,科技感,干净背景」"
              : "描述你想生成的画面,例如「营销海报,产品居中,渐变背景,高级科技感」"
          }
          className={`w-full ${textareaHeightClass} resize-none outline-none placeholder:text-placeholder bg-transparent leading-[1.6] py-1 px-0.5 ${isMaximized ? "text-base" : "text-[15px]"} overflow-y-auto`}
        />

        {/* Reference image card */}
        <div className={`mt-3 flex items-center gap-2.5 flex-wrap ${isMaximized ? "shrink-0" : ""}`}>
          <ReferenceImageCard
            image={props.referenceImage}
            onUpload={props.onReferenceUpload}
            onRemove={props.onReferenceRemove}
          />
          {isVideo && !props.referenceImage && (
            <span className="text-cap text-text-3">首帧将复刻参考图</span>
          )}
        </div>
      </div>

      {/* Param bar — 允许在窄宽/「其他」说明输入出现时换行,避免控件互相挤压 */}
      <div className={`flex gap-2.5 items-center flex-wrap px-6 pt-2 pb-4 ${isMaximized ? "shrink-0" : ""}`}>
        {/* 模型 — 点击弹出模型列表(替代原右侧抽屉) */}
        <PopoverParam
          panelWidth={384}
          disabled={props.noModels}
          ariaLabel="选择模型"
          trigger={
            <>
              <ModelIcon />
              <span className="font-medium truncate max-w-[128px]">
                {props.noModels ? "— 暂无 —" : (selectedModel?.name ?? "选择模型")}
              </span>
            </>
          }
        >
          {close => (
            <div className="py-2">
              <div className="px-3 pb-1.5 text-cap text-text-3">选择模型 · baseline 为当前推荐</div>
              <div className="max-h-[320px] overflow-y-auto px-2 space-y-2">
                {props.currentModels.length === 0 ? (
                  <p className="text-center text-text-3 text-sub py-8">暂无可用模型</p>
                ) : (
                  props.currentModels.map(m => (
                    <ModelOptionCard
                      key={m.id}
                      model={m}
                      selected={m.id === props.currentModelId}
                      onClick={() => {
                        props.onModelChange(m.id);
                        close();
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </PopoverParam>

        {/* 比例 + 数量/时长 — 融合成一个弹层 */}
        <PopoverParam
          panelWidth={isVideo ? 304 : 332}
          ariaLabel={isVideo ? "视频比例与时长" : "比例与数量"}
          trigger={
            <>
              <RatioGlyph r={props.ratio} />
              <span className="font-medium">{props.ratio}</span>
              <span className="text-text-3">·</span>
              <span className="font-medium">
                {isVideo ? `${props.duration}s` : `${props.outputCount} 张`}
              </span>
            </>
          }
        >
          {() => (
            <RatioCountPanel
              isVideo={isVideo}
              ratio={props.ratio}
              onRatioChange={props.onRatioChange}
              outputCount={props.outputCount}
              onOutputCountChange={props.onOutputCountChange}
              duration={props.duration}
              onDurationChange={props.onDurationChange}
              currentModel={selectedModel ?? null}
            />
          )}
        </PopoverParam>

        {/* 使用目的(必填)— 自定义下拉 + footer 新增按钮 */}
        {props.newTagInputOpen ? (
          <span className="h-10 px-3.5 rounded-md border border-primary bg-card flex items-center gap-1.5 text-body">
            <span className="text-text-3"><span className="text-danger mr-0.5">*</span>使用目的</span>
            <input
              type="text"
              value={props.newTagDraft}
              onChange={e => props.onNewTagDraftChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  props.onCreateTag();
                }
                if (e.key === "Escape") {
                  props.onNewTagInputOpenChange(false);
                  props.onNewTagDraftChange("");
                  props.onNewTagErrorClear();
                }
              }}
              placeholder="新标签名"
              maxLength={32}
              autoFocus
              disabled={props.newTagSubmitting}
              className="bg-transparent border-0 outline-none text-body w-[120px]"
            />
            <button
              type="button"
              onClick={props.onCreateTag}
              disabled={props.newTagSubmitting || !props.newTagDraft.trim()}
              title="保存"
              className="w-6 h-6 rounded inline-flex items-center justify-center text-primary hover:bg-primary-soft disabled:opacity-50"
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              onClick={() => {
                props.onNewTagInputOpenChange(false);
                props.onNewTagDraftChange("");
                props.onNewTagErrorClear();
              }}
              disabled={props.newTagSubmitting}
              title="取消"
              className="w-6 h-6 rounded inline-flex items-center justify-center text-text-3 hover:text-danger"
            >
              <CloseIcon />
            </button>
            {props.newTagError && <span className="text-cap text-danger ml-1">{props.newTagError}</span>}
          </span>
        ) : (
          <ParamSelect
            label="本次用途"
            value={props.purposeTagId}
            // 025 · M5 P1 波 3:单次覆盖视觉(D16 DM5.9)— purposeTagId ≠ 主标签 → ⚡ warn 配色
            accent={
              props.primaryPurposeTagId != null && props.purposeTagId !== props.primaryPurposeTagId
                ? "override"
                : "default"
            }
            options={props.purposeTags.map(t => ({
              value: t.id,
              label: t.name,
              badge: t.is_user_created ? "自定义" : undefined
            }))}
            onChange={props.onPurposeTagChange}
            valueMaxWidth={140}
            footer={
              <button
                type="button"
                onClick={() => props.onNewTagInputOpenChange(true)}
                className="w-full text-left px-2 py-1.5 text-sub text-primary hover:bg-primary-soft rounded inline-flex items-center gap-1.5"
              >
                <PlusSmallIcon />
                新增使用目的
              </button>
            }
          />
        )}

        {/* 025 · M5 P1 波 3:"其他" optional <20 字 input(D16 DM5.1) */}
        {/* 仅 purposeTagId === otherPurposeTagId 时显示,放在 ParamSelect 同行右侧 */}
        {props.otherPurposeTagId != null && props.purposeTagId === props.otherPurposeTagId && (
          <input
            type="text"
            value={props.otherNote}
            onChange={e => props.onOtherNoteChange(e.target.value.slice(0, 20))}
            maxLength={20}
            placeholder="（可选）简短说明"
            className="h-10 px-3 rounded-md border border-border-strong bg-card text-body placeholder-text-3 w-48 max-w-full min-w-0 focus:outline-none focus:border-primary"
            title="选了「其他」可写 20 字内的简短说明（仅留 audit_log）"
          />
        )}

        {/* 提交胶囊 — ⚡剩余积分 + 圆形 ↑;与比例等模块同一行,最右 */}
        {/* 024 · M5 P1 波 2:无主标签时 disabled,引导员工去会话头部选 */}
        <SubmitPill
          className="ml-auto"
          remainCredits={remainCredits}
          warning={props.quotaWarning}
          loading={props.loading}
          disabled={props.noModels || !props.prompt.trim() || !props.primaryPurposeTagId}
        />
      </div>
    </form>
  );
}

// ─── Sub components ───────────────────────────────────────────────────────

// V2 滑块式 image/video 切换 — 与原型设计 V2 dock-mode pill 一致
// 切换时 indicator 在两个 pill 之间平滑滑动（cubic-bezier），驱动视觉"滑动变身"
function KindSwitcher({ kind, onChange }: { kind: Kind; onChange: (k: Kind) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLButtonElement>(null);
  // 初值 width:0 会让首屏 indicator 看不见,且第一次测完会从 (0,0) 滑到正确位置 0.26s
  // 关键时序:
  //   1. 渲染 1: ind={3,0}, ready=false, transition:none → paint 时 width:0 看不见
  //   2. useLayoutEffect: setInd({correct}) → 触发 render 2(ready 仍 false)
  //   3. paint 2: indicator 直接跳到 correct(transition:none,无动画)
  //   4. rAF: setReady(true) → render 3
  //   5. paint 3: transition 启用,后续切 kind 才走 .26s 平滑动画
  // 如果第 4 步直接放在 useLayoutEffect 里和 setInd batched,React 一次 commit,
  // CSS transition 会从 paint 1 的 width:0 直接过渡到 paint 2 的 correct(0.26s 飞出)
  const [ind, setInd] = useState<{ left: number; width: number }>({ left: 3, width: 0 });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const target = kind === "image" ? imageRef.current : videoRef.current;
    const container = containerRef.current;
    if (target && container) {
      // 用 offsetWidth/offsetLeft 而不是 getBoundingClientRect:
      // 后者受父级 transform 影响(父 .animate-dock-pop 用 scale 动画 → measure 时拿到的是缩放后尺寸),
      // 前者基于真实 layout box,不受 transform 干扰
      setInd({ left: target.offsetLeft, width: target.offsetWidth });
    }
  }, [kind]);

  // 首次 measure 完成后,等下一帧再启用 transition(避免从 width:0 飞出来)
  useEffect(() => {
    if (ready) return;
    if (ind.width === 0) return;
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, [ind.width, ready]);

  // pill 宽度依赖字体,字体加载完后重新 measure;ResizeObserver 兜底容器宽变化(dock 折叠/展开)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const remeasure = () => {
      const target = kind === "image" ? imageRef.current : videoRef.current;
      if (!target) return;
      if (target.offsetWidth === 0) return; // skip 元素未 layout 完
      setInd({ left: target.offsetLeft, width: target.offsetWidth });
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(container);
    if (imageRef.current) ro.observe(imageRef.current);
    if (videoRef.current) ro.observe(videoRef.current);
    document.fonts?.ready?.then(remeasure).catch(() => {});
    return () => ro.disconnect();
  }, [kind]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="生成类型"
      style={{
        position: "relative",
        display: "inline-flex",
        padding: 3,
        background: "var(--bg-subtle)",
        borderRadius: 10,
        marginTop: 10,
        marginBottom: 6
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 3,
          bottom: 3,
          left: ind.left,
          width: ind.width,
          background: "var(--card)",
          borderRadius: 7,
          boxShadow:
            "0 1px 2px rgba(15,18,28,.06), 0 0 0 1px rgba(15,18,28,.04)",
          transition: ready
            ? "left .26s cubic-bezier(.4,0,.2,1), width .26s cubic-bezier(.4,0,.2,1)"
            : "none",
          zIndex: 0
        }}
      />
      <KindPill ref={imageRef} active={kind === "image"} onClick={() => onChange("image")}>
        <ImageIcon />
        图片生成
      </KindPill>
      <KindPill ref={videoRef} active={kind === "video"} onClick={() => onChange("video")}>
        <VideoIcon />
        视频生成
      </KindPill>
    </div>
  );
}

const KindPill = React.forwardRef<HTMLButtonElement, {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>(function KindPill({ active, onClick, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        position: "relative",
        zIndex: 1,
        height: 32,
        padding: "0 14px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 7,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: active ? "var(--text)" : "var(--text-2)",
        transition: "color .15s"
      }}
    >
      {children}
    </button>
  );
});

// 比例缩略图标(param 摘要里用)
function RatioGlyph({ r }: { r: Ratio }) {
  return (
    <span
      aria-hidden
      className="border-[1.4px] border-current inline-block rounded-[2px] text-text-3"
      style={ratioGlyphSize(r)}
    />
  );
}

// 比例 + 数量/时长 弹层面板内容
function RatioCountPanel({
  isVideo,
  ratio,
  onRatioChange,
  outputCount,
  onOutputCountChange,
  duration,
  onDurationChange,
  currentModel
}: {
  isVideo: boolean;
  ratio: Ratio;
  onRatioChange: (r: Ratio) => void;
  outputCount: 1 | 2 | 4;
  onOutputCountChange: (v: 1 | 2 | 4) => void;
  duration: 5 | 10;
  onDurationChange: (v: 5 | 10) => void;
  currentModel: ModelRow | null;
}) {
  // limited 模型(gpt-image-* / aihubmix)下 9:16 / 16:9 实际会被压缩,直接从选项中过滤掉
  const isLimited = currentModel ? getRatioSupport(currentModel) === "limited" : false;
  const ratios = isVideo
    ? VIDEO_RATIOS
    : isLimited
      ? (RATIOS.filter(r => (LIMITED_RATIOS as readonly string[]).includes(r)) as readonly Ratio[])
      : RATIOS;
  return (
    <div className="p-4 space-y-4">
      <section>
        <div className="text-sub text-text-3 mb-2.5">{isVideo ? "视频比例" : "选择比例"}</div>
        {/* chip 用 max-w 限制,避免数量变化时撑得过宽;justify-start 让 3 chip 时整体靠左 */}
        <div className="flex flex-wrap gap-2 justify-start">
          {ratios.map(r => {
            const on = r === ratio;
            const g = ratioGlyphSize(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => onRatioChange(r)}
                className={
                  "flex-1 min-w-[52px] max-w-[64px] py-3 rounded-lg border flex flex-col items-center gap-1.5 transition " +
                  (on
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border-strong text-text-2 hover:border-text-3 hover:text-text")
                }
              >
                <span className="h-7 flex items-center justify-center">
                  <span
                    aria-hidden
                    className="border-[1.6px] border-current inline-block rounded-[3px]"
                    style={{ width: g.width * 1.5, height: g.height * 1.5 }}
                  />
                </span>
                <span className="text-sub leading-none">{r}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="text-sub text-text-3 mb-2.5">{isVideo ? "视频时长" : "出图数量"}</div>
        <div className="flex gap-2">
          {isVideo
            ? ([5, 10] as const).map(d => (
                <SegBtn key={d} on={d === duration} onClick={() => onDurationChange(d)}>
                  {d}s
                </SegBtn>
              ))
            : ([1, 2, 4] as const).map(n => (
                <SegBtn key={n} on={n === outputCount} onClick={() => onOutputCountChange(n)}>
                  {n} 张
                </SegBtn>
              ))}
        </div>
      </section>
    </div>
  );
}

function SegBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 h-11 rounded-lg border text-body font-medium transition " +
        (on
          ? "border-primary bg-primary-soft text-primary"
          : "border-border-strong text-text-2 hover:border-text-3 hover:text-text")
      }
    >
      {children}
    </button>
  );
}

// 模型弹层里的单个模型卡片(沿用原抽屉 ModelCard 设计,略紧凑)
function ModelOptionCard({
  model,
  selected,
  onClick
}: {
  model: ModelRow;
  selected: boolean;
  onClick: () => void;
}) {
  const unit = model.type === "image" ? "积分/张" : "积分/秒";
  const ratioSupport = getRatioSupport(model);
  const ratioMeta = RATIO_SUPPORT_LABEL[ratioSupport];
  const ratioChipClass =
    ratioSupport === "strict"
      ? "bg-success-soft text-success"
      : ratioSupport === "limited"
        ? "bg-warn-soft text-warn"
        : "bg-bg text-text-3";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-full text-left rounded-lg border bg-card p-2.5 flex gap-2.5 transition " +
        (selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-border-strong hover:shadow-sm")
      }
    >
      <ModelPreview url={model.preview_url} name={model.name} type={model.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sub font-medium text-text truncate">{model.name}</span>
          {model.is_baseline && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-chip bg-primary-soft text-primary font-medium shrink-0">
              baseline
            </span>
          )}
          <span
            className={"inline-flex items-center px-1.5 py-0.5 rounded-sm text-chip font-medium shrink-0 " + ratioChipClass}
            title={ratioMeta.tooltip}
          >
            {ratioMeta.short}
          </span>
          {selected && (
            <span className="ml-auto text-primary shrink-0">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mb-1 text-cap text-text-3">
          <span className="num text-text">{model.credits_per_unit}</span>
          <span>{unit}</span>
          <span>·</span>
          <span>{model.provider}</span>
        </div>
        <p className="text-cap text-text-2 line-clamp-2" title={model.description ?? ""}>
          {model.description ?? "—"}
        </p>
      </div>
    </button>
  );
}

function ModelPreview({ url, name, type }: { url: string | null; name: string; type: "image" | "video" }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="w-14 h-14 rounded-md object-cover bg-bg shrink-0" />;
  }
  const grad = type === "image" ? "from-primary to-violet" : "from-violet to-primary";
  return (
    <div className={`w-14 h-14 rounded-md shrink-0 grid place-items-center text-white font-semibold text-h1 bg-gradient-to-br ${grad}`}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function ReferenceImageCard({
  image,
  onUpload,
  onRemove
}: {
  image: ReferenceImage | null;
  onUpload: (f: File) => void;
  onRemove: () => void;
}) {
  // 紧凑方块形态：与下方 prompt 输入框 / param 行视觉协调；不再用大紫色横幅
  // 鼠标悬浮：图片缩略 → 显示 × 按钮 + 文件名 title 提示；空态 → 实线虚线交替的"+ 图片"
  const SIZE = 56;

  if (image) {
    return (
      <div
        className="relative group"
        style={{ width: SIZE, height: SIZE, flexShrink: 0 }}
        title={`${image.name} · ${(image.size / 1024).toFixed(0)} KB`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.dataUrl}
          alt={image.name}
          className="block rounded-md object-cover border border-border bg-bg-subtle"
          style={{ width: SIZE, height: SIZE }}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="移除参考图"
          title="移除参考图"
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-text text-white text-[11px] inline-flex items-center justify-center shadow-sm hover:bg-danger transition opacity-0 group-hover:opacity-100"
          style={{ lineHeight: 1 }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <label
      className="rounded-md border border-dashed border-border-strong bg-card text-text-3 cursor-pointer transition flex flex-col items-center justify-center gap-1 hover:border-primary hover:text-primary hover:bg-primary-soft/30"
      style={{ width: SIZE, height: SIZE, flexShrink: 0 }}
      title="点击或拖入图片 · 支持 PNG/JPEG/WebP · ≤ 20MB"
    >
      <PlusSmallIcon />
      <span className="text-[10.5px] font-medium leading-none">图片</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────

function ImageIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>;
}

function VideoIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></svg>;
}

function ModelIcon() {
  // 立方体图标(对齐参考形态)
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-text-3"><path d="M12 2.6l8.5 4.9v9l-8.5 4.9-8.5-4.9v-9z" /><path d="M3.7 7.6l8.3 4.8 8.3-4.8M12 12.4v9.1" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

function PlusSmallIcon() {
  return <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
}


function ExpandIcon() {
  // ⤢ 双向箭头 — 进入放大态
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7" />
    </svg>
  );
}

function ShrinkIcon() {
  // ⤡ 内向箭头 — 退出放大态
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4v6H4M14 20v-6h6M10 10L4 4M14 14l6 6" />
    </svg>
  );
}

function MinimizeIcon() {
  // 一字下划线 — 折叠/收起到 collapsed dock
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18h12" />
    </svg>
  );
}
