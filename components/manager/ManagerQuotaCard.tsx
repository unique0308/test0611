"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// V1.5 manager 本部门配额自调卡(嵌入 /manager/dashboard)
// V1 简化:上限固定 10000(MANAGER_QUOTA_LIMIT_CAP);V2 接 admin 可自定义授权上限

const MANAGER_QUOTA_CAP = 10000;

type Props = {
  deptId: string;
  deptName: string;
  used: number;
  limit: number;
};

export function ManagerQuotaCard({ deptId, deptName, used, limit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(limit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 配额申请 modal（超出自调上限时走 admin 审批）
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  const ratio = limit > 0 ? used / limit : 0;
  const barColor =
    ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warn" : "bg-primary";

  async function handleSubmit() {
    setError(null);
    if (!Number.isFinite(draft) || draft <= 0) {
      setError("配额必须是正数");
      return;
    }
    if (draft > MANAGER_QUOTA_CAP) {
      setError(`超过上限 ${MANAGER_QUOTA_CAP.toLocaleString()}`);
      return;
    }
    if (draft === limit) {
      setEditing(false);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/manager/quotas/${deptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits_limit: draft })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `调整失败 (${res.status})`);
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-body font-semibold">{deptName} · 本月配额</h3>
          <p className="text-cap text-text-3 mt-0.5">V1 简化:单次调整上限 {MANAGER_QUOTA_CAP.toLocaleString()} 积分</p>
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRequestModalOpen(true)}
              className="h-8 px-3 rounded-md border border-border text-small text-text-2 hover:border-warn hover:text-warn transition inline-flex items-center gap-1.5"
              title="超出自调上限时，向管理员申请"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              申请加配额
            </button>
            <button
              type="button"
              onClick={() => { setDraft(limit); setEditing(true); }}
              className="h-8 px-3 rounded-md border border-border text-small text-text-2 hover:border-primary hover:text-primary transition inline-flex items-center gap-1.5"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
              调整配额
            </button>
          </div>
        )}
      </div>

      {/* 进度条 + used/limit */}
      <div className="mb-2 flex items-center gap-3">
        <div className="flex-1 h-3 bg-border rounded-full overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, ratio * 100).toFixed(1)}%` }} />
        </div>
        <span className="text-small text-text-2 num shrink-0">
          {used.toLocaleString()} / {limit.toLocaleString()} 积分
        </span>
      </div>
      <p className="text-cap text-text-3">
        已用 <span className="num">{(ratio * 100).toFixed(1)}%</span>;剩余 <span className="num">{Math.max(0, limit - used).toLocaleString()}</span> 积分
      </p>

      {requestModalOpen && (
        <QuotaRequestModal
          deptId={deptId}
          deptName={deptName}
          currentLimit={limit}
          currentUsed={used}
          onClose={() => setRequestModalOpen(false)}
        />
      )}

      {editing && (
        <div className="mt-4 pt-4 border-t border-border space-y-2">
          <label className="block text-sub text-text-2">
            新配额(积分)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex items-center h-10 px-3 bg-bg border border-border rounded-md focus-within:border-primary flex-1 max-w-[240px]">
              <input
                type="number"
                min={1}
                max={MANAGER_QUOTA_CAP}
                step={100}
                value={draft}
                onChange={e => setDraft(Number(e.target.value))}
                className="flex-1 bg-transparent outline-none text-body num"
              />
              <span className="text-cap text-text-3">积分</span>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="h-10 px-4 rounded-md bg-primary text-white text-body font-medium hover:bg-primary-ink disabled:opacity-50"
            >
              {submitting ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); setDraft(limit); }}
              disabled={submitting}
              className="h-10 px-4 rounded-md border border-border text-body text-text-2 hover:border-border-strong disabled:opacity-50"
            >
              取消
            </button>
          </div>
          {error && <p className="text-cap text-danger">{error}</p>}
          <p className="text-cap text-text-3">
            建议:留出至少 30% buffer 避免月底超限。当前值 → 新值:<span className="num text-text-2">{limit.toLocaleString()} → {draft.toLocaleString()}</span>
            {draft !== limit && (
              <span className={draft > limit ? " text-success ml-2" : " text-warn ml-2"}>
                ({draft > limit ? "+" : ""}{(draft - limit).toLocaleString()})
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function QuotaRequestModal({
  deptId,
  deptName,
  currentLimit,
  currentUsed,
  onClose
}: {
  deptId: string;
  deptName: string;
  currentLimit: number;
  currentUsed: number;
  onClose: () => void;
}) {
  const [requestedLimit, setRequestedLimit] = useState<number>(
    Math.max(currentLimit, Math.round(currentUsed * 1.5))
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const delta = requestedLimit - currentLimit;
  const valid =
    Number.isFinite(requestedLimit) &&
    requestedLimit > 0 &&
    requestedLimit !== currentLimit &&
    reason.trim().length >= 5;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/manager/quota-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: deptId,
          requested_limit: requestedLimit,
          reason: reason.trim()
        })
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error?.message ?? "提交失败");
      }
      setDone(true);
      setTimeout(onClose, 1600);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100
      }}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-md"
        style={{ width: 460, padding: 20 }}
      >
        <div style={{ marginBottom: 14 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: 4
            }}
          >
            申请加配额 · {deptName}
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>
            超出自调上限或确实需要更多额度时，向管理员申请。提交后通过飞书通知管理员审批。
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-2)",
                marginBottom: 4
              }}
            >
              当前配额
            </label>
            <div
              style={{
                fontSize: 13,
                color: "var(--text)",
                fontFamily: "var(--font-mono)"
              }}
            >
              {currentLimit.toLocaleString()} 积分 · 已用 {Math.round(currentUsed).toLocaleString()}（
              {currentLimit > 0
                ? Math.round((currentUsed / currentLimit) * 100)
                : 0}
              %）
            </div>
          </div>

          <div>
            <label
              htmlFor="qreq-limit"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-2)",
                marginBottom: 4
              }}
            >
              申请额度
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                id="qreq-limit"
                type="number"
                min={1}
                step={500}
                value={requestedLimit}
                onChange={(e) => setRequestedLimit(Number(e.target.value))}
                disabled={busy || done}
                style={{
                  width: 160,
                  height: 32,
                  padding: "0 10px",
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text)"
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color:
                    delta > 0
                      ? "var(--success)"
                      : delta < 0
                        ? "var(--warn)"
                        : "var(--text-3)",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500
                }}
              >
                {delta > 0 ? "+" : ""}
                {delta.toLocaleString()} 积分
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="qreq-reason"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-2)",
                marginBottom: 4
              }}
            >
              申请理由
              <span style={{ color: "var(--text-3)", marginLeft: 4 }}>
                （≥5 字，必填）
              </span>
            </label>
            <textarea
              id="qreq-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy || done}
              rows={3}
              placeholder="例如：本月业务高峰，需要提升 N 积分用于 X 任务"
              maxLength={500}
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 12.5,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                resize: "vertical",
                fontFamily: "inherit"
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                marginTop: 2,
                textAlign: "right"
              }}
            >
              {reason.length} / 500
            </div>
          </div>

          {error && (
            <div
              style={{
                fontSize: 12,
                color: "var(--danger)",
                padding: "6px 10px",
                background: "var(--danger-soft, #FDECEC)",
                borderRadius: 6
              }}
            >
              {error}
            </div>
          )}

          {done && (
            <div
              style={{
                fontSize: 12.5,
                color: "var(--success)",
                padding: "8px 12px",
                background: "var(--success-soft)",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              ✓ 申请已提交，管理员将通过飞书收到通知
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border)"
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 px-4 rounded-md border border-border text-body text-text-2 hover:border-border-strong disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || busy || done}
            className="h-9 px-4 rounded-md bg-primary text-white text-body font-medium hover:bg-primary-ink disabled:opacity-50"
          >
            {busy ? "提交中…" : done ? "已提交" : "提交申请"}
          </button>
        </div>
      </div>
    </div>
  );
}
