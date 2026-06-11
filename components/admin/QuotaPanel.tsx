"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DeptQuotaRow } from "@/lib/db/queries";

// 配额管理面板(设计参考 4.3 Panel 3)
// - 组织总配额展示
// - 部门表(配额 / 已用 / 使用率 / 调整)
// - "一键平均"按钮 = 总预算 / 部门数

type Props = {
  initialRows: DeptQuotaRow[];
};

export function QuotaPanel({ initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [evenDialog, setEvenDialog] = useState(false);
  const [totalBudgetInput, setTotalBudgetInput] = useState(
    rows.reduce((s, r) => s + r.credits_limit, 0).toString()
  );

  const orgUsed = rows.reduce((s, r) => s + r.credits_used, 0);
  const orgLimit = rows.reduce((s, r) => s + r.credits_limit, 0);
  const orgRatio = orgLimit > 0 ? orgUsed / orgLimit : 0;

  async function adjustOne(deptId: string, newLimit: number) {
    setBusy(deptId);
    try {
      const resp = await fetch("/api/admin/quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: deptId, credits_limit: newLimit })
      });
      if (!resp.ok) throw new Error(await resp.text());
      setRows(rs =>
        rs.map(r => (r.department_id === deptId
          ? { ...r, credits_limit: newLimit, usage_ratio: newLimit > 0 ? r.credits_used / newLimit : 0 }
          : r))
      );
      router.refresh();
    } catch (e) {
      alert(`调整失败:${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function applyEven() {
    const total = Number(totalBudgetInput);
    if (!Number.isFinite(total) || total < 0) {
      alert("请输入合法数字");
      return;
    }
    if (rows.length === 0) return;
    const per = Math.floor(total / rows.length);
    setBusy("__all__");
    try {
      // 串行避免并发写突变
      for (const r of rows) {
        await fetch("/api/admin/quotas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ department_id: r.department_id, credits_limit: per })
        });
      }
      setRows(rs => rs.map(r => ({
        ...r,
        credits_limit: per,
        usage_ratio: per > 0 ? r.credits_used / per : 0
      })));
      setEvenDialog(false);
      router.refresh();
    } catch (e) {
      alert(`一键平均失败:${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  // Day 45 续:返回 flat 内容(无内卡 chrome),由 /manage page 父级套统一外卡,
  //   跟 ReimbursementReviewPanel 风格对齐 —— 3 个 manage tab 视觉一致
  return (
    <>
      {/* 组织总配额 summary header(border-b 分隔) */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-6">
        <div className="flex-1">
          <span className="text-cap text-text-2 uppercase tracking-wider">组织本月总配额</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="num text-kpi">{orgLimit.toLocaleString()}</span>
            <span className="text-small text-text-3">积分</span>
            <span className="text-small text-text-3 ml-3">
              已用 <span className="num text-text">{orgUsed.toLocaleString()}</span>
              <span className={`ml-2 ${orgRatio >= 1 ? "text-danger" : orgRatio >= 0.8 ? "text-warn" : "text-text-3"}`}>
                ({(orgRatio * 100).toFixed(1)}%)
              </span>
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEvenDialog(true)}
          className="h-[34px] px-3 rounded-md border border-border text-body text-text hover:border-border-strong"
        >
          一键平均
        </button>
      </div>

      {/* 部门配额表 — 直接 table,边由父级外卡承担 */}
      <table className="w-full text-body">
        <thead className="bg-bg/40 text-sub text-text-2">
          <tr>
            <th className="text-left px-4 py-3 font-medium">部门</th>
            <th className="text-right px-4 py-3 font-medium">本月配额</th>
            <th className="text-right px-4 py-3 font-medium">已用</th>
            <th className="text-left px-4 py-3 font-medium w-[220px]">使用率</th>
            <th className="text-right px-4 py-3 font-medium w-[200px]">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <QuotaRow
              key={r.department_id}
              row={r}
              busy={busy === r.department_id || busy === "__all__"}
              onSubmit={n => adjustOne(r.department_id, n)}
            />
          ))}
        </tbody>
      </table>

      {/* 一键平均弹窗(简易) */}
      {evenDialog && (
        <div className="fixed inset-0 bg-text/40 flex items-center justify-center z-50" onClick={() => setEvenDialog(false)}>
          <div className="bg-card rounded-lg shadow-md p-6 w-[360px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-h1 mb-2">一键平均分配</h3>
            <p className="text-small text-text-3 mb-4">
              总预算除以 {rows.length} 个部门,每个部门得到相同配额(覆盖现有配额)
            </p>
            <label className="block text-small text-text-2 mb-1">总预算(积分)</label>
            <input
              type="number"
              value={totalBudgetInput}
              onChange={e => setTotalBudgetInput(e.target.value)}
              className="w-full h-[34px] px-3 rounded-md border border-border outline-none text-body focus:border-primary"
            />
            <p className="text-small text-text-3 mt-2">
              每部门约 <span className="num text-text">{rows.length > 0 ? Math.floor(Number(totalBudgetInput) / rows.length).toLocaleString() : 0}</span> 积分
            </p>
            <div className="flex gap-2 justify-end mt-4">
              <button
                type="button"
                onClick={() => setEvenDialog(false)}
                className="h-[34px] px-3 rounded-md border border-border text-body text-text-2"
              >
                取消
              </button>
              <button
                type="button"
                onClick={applyEven}
                disabled={busy === "__all__"}
                className="h-[34px] px-4 rounded-md bg-primary text-white text-body font-medium disabled:opacity-50"
              >
                {busy === "__all__" ? "应用中…" : "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QuotaRow({
  row,
  busy,
  onSubmit
}: {
  row: DeptQuotaRow;
  busy: boolean;
  onSubmit: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.credits_limit.toString());

  const ratio = Math.min(1, row.usage_ratio);
  const color =
    row.usage_ratio >= 1 ? "bg-danger" : row.usage_ratio >= 0.8 ? "bg-warn" : "bg-primary";

  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3">{row.department_name}</td>
      <td className="px-4 py-3 text-right num">
        {editing ? (
          <input
            type="number"
            value={val}
            onChange={e => setVal(e.target.value)}
            className="w-[100px] h-8 px-2 rounded border border-border text-right num"
          />
        ) : (
          row.credits_limit.toLocaleString()
        )}
      </td>
      <td className="px-4 py-3 text-right num">{row.credits_used.toLocaleString()}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
            <div className={`h-full ${color}`} style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
          </div>
          <span className="num text-small text-text-2 w-[44px] text-right">{(row.usage_ratio * 100).toFixed(0)}%</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        {editing ? (
          <div className="inline-flex gap-2">
            <button
              type="button"
              onClick={() => { setEditing(false); setVal(row.credits_limit.toString()); }}
              className="text-small text-text-2 hover:text-text"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const n = Number(val);
                if (!Number.isFinite(n) || n < 0) return alert("请输入合法数字");
                onSubmit(n);
                setEditing(false);
              }}
              className="text-small text-primary hover:text-primary-ink disabled:opacity-50"
            >
              保存
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-small text-primary hover:text-primary-ink"
          >
            调整
          </button>
        )}
      </td>
    </tr>
  );
}
