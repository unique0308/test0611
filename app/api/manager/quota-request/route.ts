import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getDepartmentById,
  getDepartmentQuotaSnapshot,
  writeAuditLog
} from "@/lib/db/queries";
import { sendAlert } from "@/lib/notifications";

// POST /api/manager/quota-request
// Body: { department_id, requested_limit, reason }
// 轻量版：不建独立表，写 audit_logs + 通过 sendAlert 通知 admin（mock 模式下 console）
// 后续如需完整审批流，新建 quota_requests 表 + admin 端审批页

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user.is_dept_manager && !user.is_admin) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "manager only" } },
      { status: 403 }
    );
  }

  let body: {
    department_id?: string;
    requested_limit?: number;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "not json" } },
      { status: 400 }
    );
  }

  const deptId = body.department_id;
  const requestedLimit = Number(body.requested_limit);
  const reason = (body.reason ?? "").trim();

  if (!deptId) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "department_id 必填" } },
      { status: 400 }
    );
  }
  if (!Number.isFinite(requestedLimit) || requestedLimit <= 0 || requestedLimit > 1_000_000) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "requested_limit 必须在 1-1000000 之间" } },
      { status: 400 }
    );
  }
  if (reason.length < 5) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "理由至少 5 字" } },
      { status: 400 }
    );
  }
  if (reason.length > 500) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "理由超过 500 字" } },
      { status: 400 }
    );
  }

  // manager 只能为自己管理的部门申请；admin 任意部门
  if (!user.is_admin) {
    if (!user.managed_department_ids.includes(deptId)) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "你不是该部门的负责人" } },
        { status: 403 }
      );
    }
  }

  const dept = await getDepartmentById(deptId);
  if (!dept) {
    return NextResponse.json(
      { error: { code: "not_found", message: "部门不存在" } },
      { status: 404 }
    );
  }
  const snapshot = await getDepartmentQuotaSnapshot(deptId);

  await writeAuditLog({
    user_id: user.id,
    action: "manager_quota_request",
    target_type: "department",
    target_id: deptId,
    metadata: {
      department_name: dept.name,
      current_limit: snapshot.limit_credits,
      current_used: snapshot.used_credits,
      requested_limit: requestedLimit,
      delta: requestedLimit - snapshot.limit_credits,
      reason
    }
  });

  // 通知 admin（mock 模式下打 console；feishu 模式下发到机器人 webhook）
  const message = [
    `🔔 配额申请`,
    `${dept.name} · 负责人 ${user.name}`,
    `当前 ${snapshot.limit_credits.toLocaleString()} → 申请 ${requestedLimit.toLocaleString()} 积分（${requestedLimit > snapshot.limit_credits ? "+" : ""}${(requestedLimit - snapshot.limit_credits).toLocaleString()}）`,
    `当前已用：${Math.round(snapshot.used_credits).toLocaleString()} 积分`,
    `理由：${reason}`,
    `处理：/manage?tab=quota`
  ].join("\n");
  try {
    await sendAlert(message);
  } catch {
    // 通知失败不阻塞业务（audit_logs 已记，admin 可主动查）
  }

  return NextResponse.json({ ok: true });
}
