import { requireAuth } from "@/lib/auth";
import { ReimbursementView } from "@/components/reimbursement/ReimbursementView";
import { listRequests, listEnabledToolPresets, getUserSummary } from "@/lib/reimbursements";

// 工具报销 — 侧边栏顶级页
// V2：去除 AppBar，ReimbursementView 自带内部 chrome
// TODO（视觉对齐 V2）：把内部 view 套 .page wrapper + crumb，目前保留原样

export const dynamic = "force-dynamic";

export default async function ReimbursementPage() {
  const user = await requireAuth();

  const [summary, list, toolPresets] = await Promise.all([
    getUserSummary({ user_id: user.id }),
    listRequests({ user_id: user.id, is_admin: false, page: 1, page_size: 50 }),
    listEnabledToolPresets()
  ]);

  return (
    <div className="page">
      <div className="crumb">
        <span>工作台</span>
        <span className="sep">/</span>
        <span style={{ color: "var(--text-2)" }}>工具报销</span>
      </div>
      <div className="page-head">
        <div>
          <div className="page-title">工具报销</div>
          <div className="page-subtitle">提交付费工具报销 · 查看本人记录</div>
        </div>
      </div>
      <ReimbursementView
        summary={summary}
        toolPresets={toolPresets}
        initialRows={list.rows}
        initialTotal={list.total}
      />
    </div>
  );
}
