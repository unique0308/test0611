import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  reviewRequest,
  ReimbursementNotFoundError,
  ReimbursementAlreadyReviewedError
} from "@/lib/reimbursements";
import { writeAuditLog } from "@/lib/db/queries";

// PATCH /api/admin/reimbursements/{id}/review
// body: { action: 'approve' | 'reject', comment?: string }
// 决策 D1:V1 1 级 admin 单审,manager 不参与;reject 必填 comment
// audit_logs 写 2 条:总体 admin_review_reimbursement + 子动作 reimbursement_approve|reject
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(); // 非 admin 这里就 redirect 走了,不会到下面

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return new NextResponse("invalid id", { status: 400 });
  }

  let body: { action?: unknown; comment?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }
  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return new NextResponse("action must be approve|reject", { status: 400 });
  }
  const comment =
    typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : null;

  if (action === "reject" && (!comment || comment.length === 0)) {
    return NextResponse.json(
      { error: "reject_requires_comment", message: "驳回必须填写原因" },
      { status: 422 }
    );
  }

  let row;
  try {
    row = await reviewRequest({
      id,
      reviewer_id: admin.id,
      action,
      comment
    });
  } catch (e: unknown) {
    if (e instanceof ReimbursementNotFoundError) {
      return new NextResponse("not found", { status: 404 });
    }
    if (e instanceof ReimbursementAlreadyReviewedError) {
      return NextResponse.json(
        { error: "already_reviewed", message: "该申请已被处理,无法重复审核" },
        { status: 409 }
      );
    }
    throw e;
  }

  // audit:总体 + 子动作(技术跟踪 §3.2 V1 设计决策 (6))
  const metadata = {
    request_number: row.request_number,
    amount_cny: row.amount_cny,
    target_user_id: row.user_id,
    comment: comment ?? null
  };
  await writeAuditLog({
    user_id: admin.id,
    action: "admin_review_reimbursement",
    target_type: "reimbursement_request",
    target_id: String(row.id),
    metadata: { ...metadata, action }
  });
  await writeAuditLog({
    user_id: admin.id,
    action: action === "approve" ? "reimbursement_approve" : "reimbursement_reject",
    target_type: "reimbursement_request",
    target_id: String(row.id),
    metadata
  });

  return NextResponse.json(row);
}
