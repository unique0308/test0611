"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";

// AI 洞察 quota 类卡片的 inline 调整
// admin 在洞察卡里直接采纳建议 / 自定义新值 → POST /api/admin/quotas → 自动标 actioned
// 调整后 page reload，洞察从待处理消失

export function QuotaInlineAdjust({
  insightKey,
  deptId,
  currentLimit,
  suggestedLimit
}: {
  insightKey: string;
  deptId: string;
  currentLimit: number;
  suggestedLimit?: number;
}) {
  const [value, setValue] = useState<string>(
    suggestedLimit ? String(suggestedLimit) : String(currentLimit)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numeric = Number(value);
  const valid = Number.isFinite(numeric) && numeric >= 0 && numeric !== currentLimit;
  const delta = numeric - currentLimit;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1. 改配额
      const r1 = await fetch("/api/admin/quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: deptId, credits_limit: numeric })
      });
      if (!r1.ok) {
        const d = await r1.json().catch(() => ({}));
        throw new Error(d?.error?.message ?? "调整失败");
      }
      // 2. 标记洞察已处理（note 含调整记录，方便事后追溯）
      const r2 = await fetch("/api/admin/insights/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insight_key: insightKey,
          action_type: "actioned",
          note: `配额已调整 ${currentLimit} → ${numeric}`
        })
      });
      if (!r2.ok) throw new Error("洞察状态更新失败");
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "var(--accent-soft)",
        borderRadius: 8,
        flexWrap: "wrap"
      }}
    >
      <Icon name="shield" size={14} style={{ color: "var(--accent-ink)" }} />
      <span style={{ fontSize: 12, color: "var(--text-2)" }}>
        当前 <span className="num" style={{ fontWeight: 600 }}>{currentLimit.toLocaleString()}</span>
        {suggestedLimit && (
          <>
            {" "}· 建议{" "}
            <span className="num" style={{ fontWeight: 600, color: "var(--accent-ink)" }}>
              {suggestedLimit.toLocaleString()}
            </span>
          </>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 8 }} />
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        style={{
          width: 100,
          height: 28,
          padding: "0 8px",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text)",
          textAlign: "right"
        }}
      />
      <span
        style={{
          fontSize: 11,
          color:
            delta > 0
              ? "var(--success)"
              : delta < 0
                ? "var(--warn)"
                : "var(--text-3)",
          fontFamily: "var(--font-mono)",
          minWidth: 56,
          textAlign: "left"
        }}
      >
        {delta > 0 ? "+" : ""}
        {delta.toLocaleString()}
      </span>
      <button
        type="button"
        onClick={submit}
        disabled={!valid || busy}
        className="btn btn-soft btn-sm"
        style={{ fontSize: 11.5 }}
      >
        {busy ? "调整中…" : "保存"}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "var(--danger)", width: "100%" }}>
          {error}
        </span>
      )}
    </div>
  );
}
