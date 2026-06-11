import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ManageView } from "@/components/manage/ManageView";
import { QuotaPanel } from "@/components/admin/QuotaPanel";
import { ReimbursementReviewPanel } from "@/components/admin/ReimbursementReviewPanel";
import { PurposeTagsPanel } from "@/components/admin/PurposeTagsPanel";
import {
  listAllDepartmentQuotas,
  listAllPurposeTagsForAdmin,
  writeAuditLog
} from "@/lib/db/queries";
import { listRequestsForAdmin } from "@/lib/reimbursements";
import { computeAdminTodos } from "@/lib/admin/todos";
import type { ReimbursementStatus } from "@/lib/types/v1";

// /manage 管理面板（V2 外壳 + 既有 panel）
// 实现：components/manage/ManageView.tsx（外壳）
// 内部 3 tab 复用 admin 下既有 panel —— 它们已对接真实 API，避免回归

export const dynamic = "force-dynamic";

const VALID_TABS = ["audit", "quota", "purposes"] as const;
const VALID_FILTERS: Array<"all" | ReimbursementStatus> = ["all", "pending", "approved", "rejected"];

export default async function ManagePage({
  searchParams
}: {
  searchParams: { tab?: string; filter?: string };
}) {
  const user = await requireAuth();
  if (!user.is_admin) {
    redirect("/?forbidden=admin");
  }

  const tab = (VALID_TABS as readonly string[]).includes(searchParams.tab ?? "")
    ? (searchParams.tab as "audit" | "quota" | "purposes")
    : "audit";
  const filter = (VALID_FILTERS as readonly string[]).includes(searchParams.filter ?? "")
    ? (searchParams.filter as "all" | ReimbursementStatus)
    : "all";

  const [reimbList, quotas, purposeTagsAdmin] = await Promise.all([
    listRequestsForAdmin({ page: 1, page_size: 100 }),
    listAllDepartmentQuotas(),
    listAllPurposeTagsForAdmin()
  ]);

  const pendingReimbCount = reimbList.rows.filter((r) => r.status === "pending").length;
  const todoBreakdown = computeAdminTodos({
    pendingReimb: pendingReimbCount,
    quotaRows: quotas,
    purposeTagRows: purposeTagsAdmin
  });

  await writeAuditLog({
    user_id: user.id,
    action: "admin_view_manage",
    metadata: { tab, view: "v2" }
  });

  return (
    <ManageView
      defaultTab={tab}
      todoBreakdown={todoBreakdown}
      panels={{
        audit: (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <ReimbursementReviewPanel
              initialRows={reimbList.rows}
              initialTotal={reimbList.total}
              defaultFilter={filter}
            />
          </div>
        ),
        quota: (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <QuotaPanel initialRows={quotas} />
          </div>
        ),
        purposes: (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <PurposeTagsPanel initialRows={purposeTagsAdmin} />
          </div>
        )
      }}
    />
  );
}
