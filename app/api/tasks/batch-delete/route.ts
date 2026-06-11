import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteTasksForUser, writeAuditLog } from "@/lib/db/queries";

// POST /api/tasks/batch-delete  body: { ids: string[] }
// 资产页批量删除:按任务删(连同全部产物 + 解绑收藏);非 admin 只能删自己的
// 单次 ≤ 100 条;写 audit_logs.tasks_batch_delete

const MAX_DELETE = 100;

export async function POST(req: NextRequest) {
  const user = await requireAuth();

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [
        ...new Set(
          body.ids.filter(
            (x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)
          )
        )
      ]
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "no_ids", message: "请选择至少 1 项" }, { status: 400 });
  }
  if (ids.length > MAX_DELETE) {
    return NextResponse.json(
      { error: "too_many", message: `单次最多删除 ${MAX_DELETE} 个任务` },
      { status: 422 }
    );
  }

  const { deleted } = await deleteTasksForUser({
    user_id: user.id,
    is_admin: user.is_admin,
    task_ids: ids
  });

  await writeAuditLog({
    user_id: user.id,
    action: "tasks_batch_delete",
    target_type: "generation_task_batch",
    metadata: { task_ids: ids, deleted }
  });

  return NextResponse.json({ deleted });
}
