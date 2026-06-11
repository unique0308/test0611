import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/db/queries";
import {
  buildBatchZip,
  MAX_TASKS_PER_ZIP,
  TooManyTasksError
} from "@/lib/tasks/batch-download";

// V1.15 GET /api/tasks/batch-download?ids=<comma-separated>
// 决策依据:技术跟踪 §7 Week 4 任务 4.8
//   - 单次 ≤ 100 条;> 100 返 422 让前端分批
//   - 仅 succeeded 任务可下载;其他状态 422
//   - 非 admin 严格 user_id 匹配;混入他人 task 一律 403
//   - audit_logs 写 tasks_batch_download(task_ids 数组 + total_bytes)

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map(s => s.trim())
    .filter(s => /^[0-9a-f-]{36}$/i.test(s));

  if (ids.length === 0) {
    return NextResponse.json({ error: "no_ids", message: "请选择至少 1 条任务" }, { status: 400 });
  }
  if (ids.length > MAX_TASKS_PER_ZIP) {
    return NextResponse.json(
      { error: "too_many_tasks", message: `单次最多 ${MAX_TASKS_PER_ZIP} 条,本次 ${ids.length} 条,请分批下载` },
      { status: 422 }
    );
  }

  // 取 task + result file 信息;非 admin 强制 user_id 匹配
  const supabase = getServerClient();
  const { data: tasks, error } = await supabase
    .from("generation_tasks")
    .select("id, user_id, type, status")
    .in("id", ids);
  if (error) return new NextResponse("db error", { status: 500 });

  const rows = (tasks ?? []) as Array<{ id: string; user_id: string; type: "image" | "video"; status: string }>;

  // 数量校验:有 ID 不存在 → 404
  if (rows.length !== ids.length) {
    return NextResponse.json(
      { error: "some_not_found", message: "部分任务不存在或已删除" },
      { status: 404 }
    );
  }

  // 跨用户校验:非 admin 任一行不属于自己 → 403
  if (!user.is_admin) {
    if (rows.some(r => r.user_id !== user.id)) {
      return new NextResponse("forbidden", { status: 403 });
    }
  }

  // 状态校验:仅 succeeded 可下载
  const notSucceeded = rows.filter(r => r.status !== "succeeded");
  if (notSucceeded.length > 0) {
    return NextResponse.json(
      {
        error: "not_succeeded",
        message: `${notSucceeded.length} 条任务未成功,无法打包`
      },
      { status: 422 }
    );
  }

  // 取 file_path / file_type(generation_results)
  const { data: results } = await supabase
    .from("generation_results")
    .select("task_id, file_path, file_type")
    .in("task_id", ids);

  const fileMap = new Map<string, { file_path: string; file_type: string }>();
  for (const r of (results ?? []) as Array<{ task_id: string; file_path: string; file_type: string }>) {
    if (!fileMap.has(r.task_id)) fileMap.set(r.task_id, r);
  }

  // 按 ids 顺序排列(让用户感知顺序跟选中顺序一致)
  const orderedTasks = ids.map(id => {
    const t = rows.find(r => r.id === id)!;
    const f = fileMap.get(id);
    return f
      ? { task_id: t.id, kind: t.type, file_path: f.file_path, file_type: f.file_type }
      : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  if (orderedTasks.length === 0) {
    return NextResponse.json(
      { error: "no_files", message: "选中任务都没有可下载的文件" },
      { status: 422 }
    );
  }

  // 构建 zip
  let zip;
  try {
    zip = await buildBatchZip({ userName: user.name, tasks: orderedTasks });
  } catch (e: unknown) {
    if (e instanceof TooManyTasksError) {
      return NextResponse.json({ error: "too_many_tasks", message: e.message }, { status: 422 });
    }
    // eslint-disable-next-line no-console
    console.error("[batch-zip] failed:", e);
    return new NextResponse("zip build failed", { status: 500 });
  }

  // audit(target_id 留空,task_ids 数组放 metadata)
  await writeAuditLog({
    user_id: user.id,
    action: "tasks_batch_download",
    target_type: "generation_task_batch",
    metadata: {
      task_ids: orderedTasks.map(t => t.task_id),
      count: orderedTasks.length,
      total_bytes: zip.total_bytes
    }
  });

  // RFC 5987:HTTP 头不允许非 ASCII,中文文件名需 percent-encoded UTF-8;同时给 ASCII fallback
  const asciiFallback = zip.filename.replace(/[^\x20-\x7e]/g, "_");
  const utf8Encoded = encodeURIComponent(zip.filename);

  return new NextResponse(zip.buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.total_bytes),
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`,
      "Cache-Control": "no-store"
    }
  });
}
