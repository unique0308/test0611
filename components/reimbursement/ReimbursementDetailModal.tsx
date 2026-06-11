"use client";

import { useEffect, useState } from "react";
import type { ReimbursementRequest } from "@/lib/reimbursements";
import { ToolLogo, ReimbStatusBadge, paymentTypeLabel, formatAmount } from "./shared";

// 工具报销 - 申请详情弹层(2026-05-21 新增)
// 拉 /api/reimbursements/{id} —— 返回完整申请 + attachment_signed_urls(签名后的凭证 URL)

type DetailData = ReimbursementRequest & { attachment_signed_urls: string[] };

type Props = {
  id: number;
  onClose: () => void;
};

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif"];

function extOf(ref: string): string {
  const m = /\.([a-z0-9]+)(?:\?|$)/i.exec(ref);
  return m ? m[1].toLowerCase() : "";
}

export function ReimbursementDetailModal({ id, onClose }: Props) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/reimbursements/${id}`, { signal: ac.signal })
      .then(r => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then((d: DetailData) => setData(d))
      .catch(() => {
        if (!ac.signal.aborted) setError("加载失败,请重试");
      });
    return () => ac.abort();
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(15,18,28,.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl shadow-md w-full max-w-[560px] max-h-[86vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="text-body font-semibold inline-flex items-center gap-2">
            报销申请详情
            {data && <span className="num text-small text-text-3">{data.request_number}</span>}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="w-7 h-7 rounded grid place-items-center text-text-3 hover:bg-bg hover:text-text transition"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <div className="text-center text-text-3 py-10">{error}</div>}
          {!error && !data && <div className="text-center text-text-3 py-10">加载中…</div>}
          {data && (
            <div className="space-y-4">
              {/* 工具 + 金额 + 状态 */}
              <div className="flex items-center gap-3">
                <ToolLogo name={data.tool_name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-body font-semibold truncate">{data.tool_name}</div>
                  <div className="text-cap text-text-3">{paymentTypeLabel(data.payment_type)}</div>
                </div>
                <ReimbStatusBadge status={data.status} />
              </div>

              <div className="bg-bg rounded-lg px-4 py-3">
                <div className="text-cap text-text-3">报销金额</div>
                <div className="text-kpi num text-text">
                  <span className="text-body text-text-3 mr-1">¥</span>
                  {formatAmount(data.amount_cny)}
                </div>
              </div>

              {/* 元数据 */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Meta k="使用周期" v={`${data.usage_period_start} → ${data.usage_period_end}`} />
                <Meta k="费用类型" v={paymentTypeLabel(data.payment_type)} />
                <Meta k="提交时间" v={formatTime(data.created_at)} />
                <Meta k="审核时间" v={data.reviewed_at ? formatTime(data.reviewed_at) : "—"} />
              </dl>

              {/* 使用说明 */}
              <div>
                <div className="text-cap text-text-3 mb-1">使用说明</div>
                <p className="text-sub text-text leading-relaxed whitespace-pre-wrap bg-bg rounded-md px-3 py-2.5">
                  {data.purpose_description}
                </p>
              </div>

              {/* 凭证 */}
              <div>
                <div className="text-cap text-text-3 mb-1.5">
                  上传凭证 <span className="num">({data.attachment_signed_urls.length})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.attachment_signed_urls.map((url, i) => {
                    const isImage = IMAGE_EXT.includes(extOf(data.attachment_urls[i] ?? url));
                    return isImage ? (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="block" title="查看大图">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`凭证 ${i + 1}`}
                          className="w-20 h-20 object-cover rounded-md border border-border hover:border-primary transition"
                        />
                      </a>
                    ) : (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="h-20 w-28 rounded-md border border-border hover:border-primary transition flex flex-col items-center justify-center gap-1 text-text-2"
                      >
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        <span className="text-cap">凭证 {i + 1}</span>
                      </a>
                    );
                  })}
                </div>
              </div>

              {/* 驳回原因 */}
              {data.status === "rejected" && data.review_comment && (
                <div className="bg-danger-soft border border-danger/20 rounded-md px-3 py-2.5">
                  <div className="text-cap text-danger font-medium mb-0.5">驳回原因</div>
                  <p className="text-sub text-danger leading-relaxed whitespace-pre-wrap">{data.review_comment}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-cap text-text-3">{k}</dt>
      <dd className="text-sub text-text num">{v}</dd>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
