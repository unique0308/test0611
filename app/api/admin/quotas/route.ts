import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { updateDepartmentQuota, writeAuditLog } from "@/lib/db/queries";

// POST /api/admin/quotas
// Body: { department_id, credits_limit }
// 仅 admin

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user.is_admin) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: { department_id?: string; credits_limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "invalid JSON" } }, { status: 400 });
  }

  if (!body.department_id) {
    return NextResponse.json({ error: { message: "department_id 必填" } }, { status: 400 });
  }
  const newLimit = Number(body.credits_limit);
  if (!Number.isFinite(newLimit) || newLimit < 0) {
    return NextResponse.json({ error: { message: "credits_limit 必须 ≥ 0" } }, { status: 400 });
  }

  await updateDepartmentQuota(body.department_id, newLimit);

  await writeAuditLog({
    user_id: user.id,
    action: "quota_adjust",
    target_type: "department",
    target_id: body.department_id,
    metadata: { credits_limit: newLimit },
    ip_address: req.headers.get("x-forwarded-for") ?? null
  });

  return NextResponse.json({ ok: true });
}
