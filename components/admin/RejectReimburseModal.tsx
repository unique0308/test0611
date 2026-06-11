"use client";

import { useState, useEffect } from "react";
import { REJECT_REASON_PRESETS } from "@/lib/reimbursements";

// V1.4 驳回原因 modal(设计参考 §3.24)
// 5 预设原因 chip(点击预填进 textarea)+ 必填 textarea + 危险按钮"驳回"
// 遮罩 rgba(20,26,40,.36) + backdrop-blur + pop .14s 进入动画

type Props = {
  open: boolean;
  request_number: string;
  amount_cny: number;
  tool_name: string;
  user_name: string;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
};

export function RejectReimburseModal({
  open,
  request_number,
  amount_cny,
  tool_name,
  user_name,
  submitting,
  onCancel,
  onConfirm
}: Props) {
  const [comment, setComment] = useState("");

  // 每次打开重置
  useEffect(() => {
    if (open) setComment("");
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  const canConfirm = comment.trim().length > 0 && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(20,26,40,.36)", backdropFilter: "blur(2px)" }}
      onClick={() => !submitting && onCancel()}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl w-[520px] max-w-[92vw] overflow-hidden"
        style={{
          boxShadow: "0 24px 60px rgba(20,26,40,.18), 0 4px 12px rgba(20,26,40,.06)",
          animation: "modal-pop .14s ease-out"
        }}
      >
        {/* head */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md inline-flex items-center justify-center bg-danger-soft text-danger">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v5M12 17h.01" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </span>
            <div>
              <div className="text-body font-semibold">驳回报销申请</div>
              <div className="text-cap text-text-3">
                {request_number} · {user_name} · {tool_name} · ¥ {amount_cny.toFixed(2)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="w-7 h-7 rounded inline-flex items-center justify-center text-text-3 hover:bg-bg hover:text-text disabled:opacity-50"
            aria-label="关闭"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <div className="text-cap text-text-2 mb-2">常见驳回原因(点击可预填):</div>
            <div className="flex flex-wrap gap-1.5">
              {REJECT_REASON_PRESETS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setComment(r)}
                  disabled={submitting}
                  className="px-2.5 py-1 rounded-md text-cap text-text-2 bg-bg border border-border hover:border-danger hover:text-danger transition disabled:opacity-50"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sub text-text-2 mb-1.5">
              驳回原因 <span className="text-danger">*</span>
              <span className="text-cap text-text-3 ml-2">必填,员工会看到</span>
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="请说明驳回原因,例如:发票抬头不对、与平台已有工具重复…"
              className="w-full bg-bg border border-border rounded-md p-3 text-body outline-none focus:border-danger placeholder:text-placeholder resize-y"
            />
            <div className="text-cap text-text-3 mt-1 text-right num">
              {comment.length} / 1000
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-3.5 border-t border-border bg-bg/30 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-9 px-4 rounded-md border border-border text-body text-text-2 hover:border-border-strong disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => canConfirm && onConfirm(comment.trim())}
            disabled={!canConfirm}
            className="h-9 px-4 rounded-md bg-danger text-white text-body font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            {submitting ? "处理中…" : "确认驳回"}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes modal-pop {
          from { transform: translateY(8px) scale(.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
