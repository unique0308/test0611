import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDeptQuotaHistory } from "@/lib/db/queries";

// GET /api/admin/dept-quota-history?dept_id=<uuid>&months=6
// 返回部门近 N 月使用率历史 — DeptDetailPanel 6 月历史小卡 + AI 洞察"配额冷热"复用

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user.is_admin && !user.is_dept_manager) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "admin or manager only" } },
      { status: 403 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const deptId = sp.get("dept_id");
  if (!deptId) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "dept_id 必填" } },
      { status: 400 }
    );
  }
  const monthsRaw = Number(sp.get("months") ?? 6);
  const months = Math.min(24, Math.max(1, Number.isFinite(monthsRaw) ? monthsRaw : 6));

  const rows = await getDeptQuotaHistory(deptId, months);
  return NextResponse.json({ rows });
}
