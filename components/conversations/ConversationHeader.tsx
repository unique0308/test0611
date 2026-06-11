"use client";

// M5 P1 波 2 · D16 DM5.9 + DM17.7 落地:会话头部常驻主标签 chip
//
// 形态:
//   有主标签:  [📌 主标签: 营销推广  ✎]
//   无主标签:  [📌 选择主标签 ↓]   (warning 色提示员工必选)
//
// 行为:
//   点 chip → popover 显示 active purpose tags(5 预设 + 用户自定义 active) → 选一个
//   PATCH /api/conversations/{id} body={ primary_purpose_tag_id } → router.refresh()
//
// 自定义入口暂不在 ConversationHeader 内(等 P2 schema 改造完成,见 V1灰测版PRD § 2.1 P2)
// 员工要新建自定义 tag,仍走 Dock 的 ParamSelect 路径,创完后刷新页面在头部能看到

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PurposeTagRow } from "@/lib/db/queries";

type Props = {
  conversationId: string;
  primaryPurposeTagId: string | null;
  purposeTags: PurposeTagRow[];
};

export function ConversationHeader({ conversationId, primaryPurposeTagId, purposeTags }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const currentTag = purposeTags.find(t => t.id === primaryPurposeTagId) ?? null;

  // 点外 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function selectTag(tagId: string) {
    if (submitting || tagId === primaryPurposeTagId) {
      setOpen(false);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_purpose_tag_id: tagId })
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        const msg = data?.error?.message ?? "设置失败,请重试";
        setError(msg);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message ?? "网络异常");
    } finally {
      setSubmitting(false);
    }
  }

  const hasPrimary = currentTag !== null;

  return (
    <div ref={rootRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={submitting}
        className={
          "h-8 px-3 rounded-full border inline-flex items-center gap-1.5 text-sub transition " +
          (hasPrimary
            ? "border-border-strong bg-card text-text hover:border-primary"
            : "border-warn bg-warn-soft text-warn hover:border-warn") +
          (submitting ? " opacity-60 cursor-wait" : " cursor-pointer")
        }
        title={hasPrimary ? "点击切换会话主标签" : "请先选择会话主标签后才能生成"}
      >
        <span aria-hidden>📌</span>
        {hasPrimary ? (
          <>
            <span className="text-text-3">主标签:</span>
            <span className="font-medium">{currentTag.name}</span>
            <span className="ml-0.5 text-text-3">✎</span>
          </>
        ) : (
          <>
            <span>选择主标签</span>
            <span className="text-text-3">↓</span>
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-20 min-w-[200px] bg-card border border-border-strong rounded-md shadow-lg py-1"
          role="listbox"
        >
          <div className="px-3 py-1.5 text-cap text-text-3">选择会话主标签</div>
          {purposeTags.map(t => {
            const isSelected = t.id === primaryPurposeTagId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTag(t.id)}
                disabled={submitting}
                className={
                  "w-full text-left px-3 py-1.5 text-body inline-flex items-center justify-between transition " +
                  (isSelected ? "bg-primary-soft text-primary-ink" : "hover:bg-bg")
                }
                role="option"
                aria-selected={isSelected}
              >
                <span className="inline-flex items-center gap-1.5">
                  {t.name}
                  {t.is_user_created && (
                    <span className="text-cap text-text-3 px-1 py-0.5 bg-bg rounded">自定义</span>
                  )}
                </span>
                {isSelected && <span className="text-primary">✓</span>}
              </button>
            );
          })}
          {error && (
            <div className="px-3 py-1.5 text-cap text-danger border-t border-border mt-1">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
