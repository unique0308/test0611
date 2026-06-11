"use client";

// 折叠态对话框 — docked 布局的默认形态,一条窄横版常驻视口底部
// 视觉(2026-05-20 嘉斌确认形态):
//   单行 ~56h:左 Tab 切换胶囊 + 参考图小卡(或 +) + prompt 预览(灰占位 / 已写实色)
//   右:⚡ 余额 pill + 圆形提交按钮 ↑
//   点击 prompt 预览区 → 展开为完整 GenerationDock(docked variant)
//   Tab 切换 / 参考图上传 / 提交 在折叠态也可直接操作(无需先展开)

import { useState } from "react";
import type { ModelRow, PurposeTagRow } from "@/lib/db/queries";
import type { Kind, Ratio, ReferenceImage } from "@/components/generate/types";
import { SubmitPill } from "@/components/generate/SubmitPill";

type Props = {
  kind: Kind;
  prompt: string;
  ratio: Ratio;
  outputCount: 1 | 2 | 4;
  duration: 5 | 10;
  currentModels: ModelRow[];
  currentModelId: string;
  purposeTags: PurposeTagRow[];
  purposeTagId: string;
  referenceImage: ReferenceImage | null;
  loading: boolean;
  noModels: boolean;
  usedCredits: number;
  limitCredits: number;
  quotaWarning: "green" | "yellow" | "red";
  onSubmit: (e: React.FormEvent) => void;
  onExpand: () => void;
  onReferenceUpload: (f: File) => void;
  onReferenceRemove: () => void;
  /** feed 未触底时显示 "回到底部" 浮 chip；点击触发回到底部 + dock 展开 */
  showBackToBottom?: boolean;
  onBackToBottom?: () => void;
};

export function CollapsedDock(props: Props) {
  const isVideo = props.kind === "video";
  const remainCredits = Math.max(props.limitCredits - props.usedCredits, 0);

  const [dragOver, setDragOver] = useState(false);

  // 整个折叠条接受图片拖放 —— 不必精确拖到参考图小卡内
  function onDockDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      if (!dragOver) setDragOver(true);
    }
  }
  function onDockDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
  }
  function onDockDrop(e: React.DragEvent) {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f.type.startsWith("image/")) props.onReferenceUpload(f);
  }

  const placeholder = isVideo
    ? "描述你想生成的视频,例如「营销短视频:产品旋转展示」…"
    : "写一句话描述你想生成的画面…";

  return (
    <div className="relative">
      {/* 回到底部 chip — dock 处于折叠态时常驻可见（CollapsedDock 渲染本身意味着用户不在底部）
          视觉：白底浅字浅边框 + hover 时字色加深 + 轻阴影提示可点 */}
      {props.onBackToBottom && (
        <button
          type="button"
          onClick={props.onBackToBottom}
          className="absolute -top-9 right-2 z-10 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-card border border-border text-text-3 text-cap shadow-sm hover:text-text hover:border-border-strong transition"
          title="回到底部输入"
        >
          回到底部
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      <form
        onSubmit={props.onSubmit}
        onDragOver={onDockDragOver}
        onDragLeave={onDockDragLeave}
        onDrop={onDockDrop}
        className={
          "bg-card border rounded-2xl shadow-dock transition-all duration-150 hover:-translate-y-0.5 hover:border-violet hover:shadow-dock-focus focus-within:-translate-y-0.5 focus-within:border-violet focus-within:shadow-dock-focus flex items-center gap-2.5 px-3.5 py-3 " +
          (dragOver ? "border-success ring-2 ring-success" : "border-border-strong")
        }
      >
      {/* 参考图 mini 卡 */}
      <ReferenceMini
        image={props.referenceImage}
        onUpload={props.onReferenceUpload}
        onRemove={props.onReferenceRemove}
      />

      {/* 中:prompt 占位/预览 — 点击展开 */}
      <button
        type="button"
        onClick={props.onExpand}
        className="flex-1 min-w-0 h-12 text-left flex items-center px-3 rounded-md hover:bg-bg/60 transition"
        title="点击展开输入区"
      >
        <span
          className={
            "truncate text-[15px] " +
            (props.prompt ? "text-text" : "text-text-3")
          }
        >
          {props.prompt || placeholder}
        </span>
      </button>

      {/* 提交胶囊 — ⚡剩余积分 + 圆形 ↑(折叠态用 lg) */}
      <SubmitPill
        size="lg"
        remainCredits={remainCredits}
        warning={props.quotaWarning}
        loading={props.loading}
        disabled={props.noModels || !props.prompt.trim()}
      />
      </form>
    </div>
  );
}

// ─── Sub components ───────────────────────────────────────────────────────

function ReferenceMini({
  image,
  onUpload,
  onRemove
}: {
  image: ReferenceImage | null;
  onUpload: (f: File) => void;
  onRemove: () => void;
}) {
  // 拖放由整个折叠条统一接管(见 CollapsedDock onDockDrop);本卡只负责点击选图
  if (image) {
    return (
      <div className="relative shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.dataUrl}
          alt={image.name}
          title={image.name}
          className="w-12 h-12 rounded-md object-cover border border-violet shadow-sm"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="移除参考图"
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-text/70 hover:bg-text text-white text-[9px] flex items-center justify-center"
        >
          ×
        </button>
      </div>
    );
  }
  return (
    <label
      title="上传参考图"
      className="w-12 h-12 rounded-md border border-dashed shrink-0 cursor-pointer flex items-center justify-center transition border-border-strong bg-card text-text-3 hover:border-success hover:text-success hover:bg-success-soft/50"
    >
      <PlusIcon />
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────

function PlusIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
}
