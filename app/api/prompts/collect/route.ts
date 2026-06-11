import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  collectFromTask,
  PromptCollectionLimitReachedError,
  TaskNotFoundError
} from "@/lib/prompts";
import { writeAuditLog } from "@/lib/db/queries";

// POST /api/prompts/collect
// body: { task_id: string, output_index?: number }
// 幂等:同 user_id + task_id + output_index 已存在则返回已有记录
// 2026-05-22:收藏粒度到单张产物
export async function POST(req: NextRequest) {
  const user = await requireAuth();

  let body: { task_id?: unknown; output_index?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }
  const taskId = body.task_id;
  if (typeof taskId !== "string" || taskId.length === 0) {
    return new NextResponse("task_id required", { status: 400 });
  }
  const outputIndex =
    typeof body.output_index === "number" && Number.isInteger(body.output_index) && body.output_index >= 0
      ? body.output_index
      : 0;

  try {
    const row = await collectFromTask({ user_id: user.id, task_id: taskId, output_index: outputIndex });
    await writeAuditLog({
      user_id: user.id,
      action: "prompt_collect",
      target_type: "prompt_collection",
      target_id: String(row.id),
      metadata: { task_id: taskId, kind: row.kind }
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    if (e instanceof TaskNotFoundError) {
      return new NextResponse("task not found", { status: 404 });
    }
    if (e instanceof PromptCollectionLimitReachedError) {
      // 决策 Q-V1-01:200 条上限,返回 422 让前端提示清理
      return NextResponse.json(
        { error: "collection_limit_reached", message: "已达到 200 条收藏上限,请清理后再收藏" },
        { status: 422 }
      );
    }
    throw e;
  }
}
