// admin / manage 共享的"待办"口径
// 决策点（2026-05-26 用户拍板）：
//   total = 报销待审 + 配额超额（≥100%）。临近、合并建议不计入 total，只作侧提示。
// 这样 admin KPI 卡和 manage todo-bar 总数严格一致，跨入口数字可解释。

export type TodoBreakdown = {
  pendingReimb: number;
  /** usage_ratio >= 1 的部门数（danger） */
  overQuota: number;
  /** usage_ratio ∈ [0.8, 1) 的部门数（warning，foot 提示用） */
  nearQuota: number;
  /** 非默认且未合并的标签数（治理建议，不计入 total） */
  mergeCandidates: number;
  /** = pendingReimb + overQuota */
  total: number;
};

type QuotaRowLike = { usage_ratio: number };
type PurposeTagRowLike = { is_default: boolean; merged_into_id: string | null };

export function computeAdminTodos(input: {
  pendingReimb: number;
  quotaRows: QuotaRowLike[];
  purposeTagRows: PurposeTagRowLike[];
}): TodoBreakdown {
  const overQuota = input.quotaRows.filter((q) => q.usage_ratio >= 1).length;
  const nearQuota = input.quotaRows.filter(
    (q) => q.usage_ratio >= 0.8 && q.usage_ratio < 1
  ).length;
  const mergeCandidates = input.purposeTagRows.filter(
    (t) => !t.is_default && t.merged_into_id == null
  ).length;
  return {
    pendingReimb: input.pendingReimb,
    overQuota,
    nearQuota,
    mergeCandidates,
    total: input.pendingReimb + overQuota
  };
}

// admin KPI 卡 foot 文案 — 永远显示主二项，nearQuota / mergeCandidates 作"另"补充
export function formatTodoFoot(b: TodoBreakdown): string {
  const head = `${b.pendingReimb} 报销待审 · ${b.overQuota} 配额超额`;
  const extras: string[] = [];
  if (b.nearQuota > 0) extras.push(`${b.nearQuota} 临近`);
  if (b.mergeCandidates > 0) extras.push(`${b.mergeCandidates} 合并建议`);
  return extras.length > 0 ? `${head} · 另 ${extras.join(" · ")}` : head;
}
