import { NextResponse, type NextRequest } from "next/server";
import { requireManagerOfDept } from "@/lib/auth";
import {
  updateDepartmentQuotaByManager,
  ManagerQuotaOverCapError,
  MANAGER_QUOTA_LIMIT_CAP,
  writeAuditLog,
  getDepartmentById
} from "@/lib/db/queries";

// V1.5 PATCH /api/manager/quotas/{deptId}
// 决策依据:技术跟踪 §7 Week 5 任务 5.4
//   - requireManagerOfDept(deptId) 中间件(admin 自动 superset,manager 必须管这个 deptId)
//   - V1 简化:credits_limit 上限固定 10000(MANAGER_QUOTA_LIMIT_CAP);V2 admin 可自定义授权上限
//   - audit `manager_quota_adjust` 写 old_limit / new_limit / dept_name
export async function PATCH(
  req: NextRequest,
  { params }: { params: { deptId: string } }
) {
  const deptId = params.deptId;
  if (!/^[0-9a-f-]{36}$/i.test(deptId)) {
    return new NextResponse("invalid deptId", { status: 400 });
  }

  // 权限:manager 管这个 dept,或 admin superset
  const user = await requireManagerOfDept(deptId);

  let body: { credits_limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }
  const newLimit = Number(body.credits_limit);
  if (!Number.isFinite(newLimit) || newLimit <= 0) {
    return NextResponse.json(
      { error: "invalid_limit", message: "credits_limit 必须是正数" },
      { status: 422 }
    );
  }

  // 取 dept 信息给 audit metadata
  const dept = await getDepartmentById(deptId);
  if (!dept) return new NextResponse("dept not found", { status: 404 });

  let result;
  try {
    result = await updateDepartmentQuotaByManager({ deptId, newLimit });
  } catch (e: unknown) {
    if (e instanceof ManagerQuotaOverCapError) {
      return NextResponse.json(
        {
          error: "over_cap",
          message: `配额超过上限 ${MANAGER_QUOTA_LIMIT_CAP},请减少额度`,
          cap: MANAGER_QUOTA_LIMIT_CAP
        },
        { status: 422 }
      );
    }
    throw e;
  }

  await writeAuditLog({
    user_id: user.id,
    action: "manager_quota_adjust",
    target_type: "department",
    target_id: deptId,
    metadata: {
      dept_name: dept.name,
      old_limit: result.old_limit,
      new_limit: result.new_limit,
      adjusted_by_role: user.is_admin ? "admin" : "manager"
    }
  });

  return NextResponse.json({
    deptId,
    dept_name: dept.name,
    old_limit: result.old_limit,
    new_limit: result.new_limit
  });
}
