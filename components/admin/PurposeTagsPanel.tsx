"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPurposeTagRow } from "@/lib/db/queries";

// V1.12 admin 使用目的管理 panel
// 列表所有 tag(含已合并)+ 选 source(必须 is_user_created)+ 选 target → 合并 modal → PATCH
// Q-V1-10:不审核直接生效;Day 37 admin 合并能力

type Props = {
  initialRows: AdminPurposeTagRow[];
};

export function PurposeTagsPanel(props: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(props.initialRows);
  const [sourceId, setSourceId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source = rows.find(r => r.id === sourceId);
  const target = rows.find(r => r.id === targetId);
  // 候选 source:user_created 且未合并;target:任意未合并 + 非自身
  const sourceCandidates = rows.filter(r => r.is_user_created && !r.merged_into_id);
  const targetCandidates = rows.filter(r => !r.merged_into_id && r.id !== sourceId);

  const userCount = rows.filter(r => r.is_user_created).length;
  const mergedCount = rows.filter(r => r.merged_into_id).length;
  const activeCount = rows.filter(r => !r.merged_into_id).length;

  async function handleConfirmMerge() {
    if (!sourceId || !targetId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/purpose-tags/merge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId, target_id: targetId })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `合并失败 (${res.status})`);
      }
      const result = await res.json() as { source_name: string; target_name: string; affected_tasks: number };
      // 本地更新行
      setRows(prev => prev.map(r => r.id === sourceId ? { ...r, merged_into_id: targetId, merged_into_name: result.target_name } : r));
      setSourceId("");
      setTargetId("");
      setModalOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Day 45 续:返回 flat 内容(无内卡 chrome),由 /manage page 父级套统一外卡,
  //   跟 ReimbursementReviewPanel / QuotaPanel 风格对齐
  return (
    <>
      {/* 顶部统计行(inline,非 card grid) */}
      <div className="px-5 py-3 border-b border-border bg-bg/30 flex items-center gap-6 flex-wrap">
        <InlineStat label="活跃标签" value={activeCount} />
        <InlineStat label="自定义标签" value={userCount} tone="violet" />
        <InlineStat label="已合并" value={mergedCount} tone="muted" />
        <InlineStat
          label="默认 / 预设"
          value={rows.filter(r => r.is_default || (!r.is_user_created && !r.merged_into_id)).length}
          tone="blue"
        />
      </div>

      {/* 合并工具 section */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-body font-semibold">合并自定义标签</h3>
            <p className="text-cap text-text-3 mt-0.5">把员工自定义的近义标签合并到一个目标标签(快照历史 purpose_tag_name 保留不变,决策 3.2)</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2">
            <span className="text-sub text-text-2">合并源 →</span>
            <select
              value={sourceId}
              onChange={e => { setSourceId(e.target.value); if (e.target.value === targetId) setTargetId(""); }}
              className="h-9 px-3 rounded-md border border-border bg-card text-body outline-none focus:border-primary"
            >
              <option value="">选 source (用户自定义)…</option>
              {sourceCandidates.map(r => (
                <option key={r.id} value={r.id}>{r.name}({r.task_count} 任务)</option>
              ))}
            </select>
          </label>

          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-text-3"><path d="M5 12h14M13 5l7 7-7 7" /></svg>

          <label className="inline-flex items-center gap-2">
            <span className="text-sub text-text-2">合并到</span>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              disabled={!sourceId}
              className="h-9 px-3 rounded-md border border-border bg-card text-body outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">选 target…</option>
              {targetCandidates.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.is_default ? "(默认)" : ""}{!r.is_user_created && !r.is_default ? "(预设)" : ""}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={!sourceId || !targetId}
            className="h-9 px-4 rounded-md bg-warn text-white text-body font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            合并 →
          </button>

          {sourceCandidates.length === 0 && (
            <span className="text-cap text-text-3">暂无员工自定义标签</span>
          )}
        </div>
        {error && <p className="text-cap text-danger mt-2">{error}</p>}
      </div>

      {/* 标签列表 — flat table,边由父级外卡承担 */}
      <table className="w-full text-body">
        <thead>
          <tr className="text-sub text-text-2 border-b border-border bg-bg/40">
            <th className="text-left px-4 py-3 font-medium">名称</th>
            <th className="text-left px-4 py-3 font-medium w-[100px]">来源</th>
            <th className="text-right px-4 py-3 font-medium w-[100px]">引用任务</th>
            <th className="text-left px-4 py-3 font-medium w-[180px]">状态</th>
            <th className="text-left px-4 py-3 font-medium w-[140px]">创建时间</th>
          </tr>
        </thead>
        <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-bg/30">
                <td className="px-4 py-3">
                  <span className={r.merged_into_id ? "text-text-3 line-through" : "text-text"}>{r.name}</span>
                  {r.is_default && <span className="ml-2 inline-flex items-center px-1.5 py-0 rounded-sm text-chip bg-primary-soft text-primary">默认</span>}
                </td>
                <td className="px-4 py-3">
                  {r.is_user_created
                    ? <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-chip bg-violet-soft text-violet">自定义</span>
                    : <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-chip bg-bg text-text-2 border border-border">预设</span>
                  }
                </td>
                <td className="px-4 py-3 text-right num text-text-2">{r.task_count}</td>
                <td className="px-4 py-3">
                  {r.merged_into_id ? (
                    <span className="text-cap text-text-3">已合并 →&nbsp;
                      <span className="text-text-2">{r.merged_into_name}</span>
                    </span>
                  ) : (
                    <span className="text-cap text-success">活跃</span>
                  )}
                </td>
                <td className="px-4 py-3 text-cap text-text-3 num">{new Date(r.created_at).toLocaleDateString("zh-CN")}</td>
              </tr>
            ))}
          </tbody>
        </table>

      {/* 确认 modal */}
      {modalOpen && source && target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(20,26,40,.36)", backdropFilter: "blur(2px)" }}
          onClick={() => !submitting && setModalOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-card rounded-xl w-[480px] max-w-[92vw] overflow-hidden"
            style={{ boxShadow: "0 24px 60px rgba(20,26,40,.18), 0 4px 12px rgba(20,26,40,.06)" }}
          >
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-body font-semibold">确认合并标签</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-body text-text-2">
                <span className="text-text font-medium">{source.name}</span>
                <span className="text-text-3 mx-2">→</span>
                <span className="text-text font-medium">{target.name}</span>
              </p>
              <ul className="list-disc list-inside text-sub text-text-3 space-y-1">
                <li>"{source.name}" 在使用目的列表中**立即隐藏**;员工后续无法选</li>
                <li>历史 {source.task_count} 条任务的 `purpose_tag_name="{source.name}"` 快照**保留不变**(决策 3.2)</li>
                <li>统计 / 看板新数据合并到 "{target.name}"</li>
                <li>本次操作记 audit `admin_merge_purpose_tags`</li>
              </ul>
            </div>
            <div className="px-5 py-3.5 border-t border-border bg-bg/30 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="h-9 px-4 rounded-md border border-border text-body text-text-2 hover:border-border-strong disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmMerge}
                disabled={submitting}
                className="h-9 px-4 rounded-md bg-warn text-white text-body font-medium hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "合并中…" : "确认合并"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 顶部 inline stat(替代旧 StatBlock 大卡;Day 45 续不再用 card grid)
function InlineStat({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone?: "blue" | "violet" | "muted";
}) {
  const fg =
    tone === "blue"
      ? "text-primary"
      : tone === "violet"
        ? "text-violet"
        : tone === "muted"
          ? "text-text-3"
          : "text-text";
  return (
    <span className="inline-flex items-baseline gap-1.5 text-sub">
      <span className="text-text-2">{label}</span>
      <span className={"num font-semibold text-[16px] " + fg}>{value}</span>
      <span className="text-chip text-text-3">个</span>
    </span>
  );
}
