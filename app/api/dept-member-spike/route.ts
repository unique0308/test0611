import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listDeptMemberWeeklyComparison } from "@/lib/db/queries";

// GET /api/dept-member-spike?dept_id=<uuid>
// 返回部门成员本周 vs 上周对比
// 权限：admin 任意部门；manager 仅自己管理的部门

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  const sp = req.nextUrl.searchParams;
  const deptId = sp.get("dept_id");
  if (!deptId) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "dept_id 必填" } },
      { status: 400 }
    );
  }

  if (!user.is_admin) {
    if (!user.is_dept_manager || !user.managed_department_ids.includes(deptId)) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "only admin or this dept manager" } },
        { status: 403 }
      );
    }
  }

  const rows = await listDeptMemberWeeklyComparison(deptId);
  return NextResponse.json({ rows });
}
