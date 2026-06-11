import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import {
  createResult,
  markTaskSucceeded,
  markTaskFailed,
  writeAuditLog,
  getModelById,
  bumpConversationByTaskId
} from "@/lib/db/queries";
import { getTaskStatus, GenerationError, type Provider } from "@/lib/easyrouter";
import { uploadFile, getSignedUrl } from "@/lib/storage";

// GET /api/tasks/{id}
// 任务状态查询,前端 3 秒轮询用(技术 5.1 节)
// running 且距离上次 poll ≥ 3s → 主动去上游查;completed 时下载并落盘 + markSucceeded

const POLL_THROTTLE_MS = 3000;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();
  const supabase = getServerClient();

  // 1. 取 task,鉴权
  const { data: task } = await supabase
    .from("generation_tasks")
    .select(
      "id, user_id, status, type, model_id, model_name, prompt, ratio, duration_seconds, purpose_tag_name, easyrouter_task_id, credits_cost, cost_cny, error_message, last_polled_at, created_at"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!task) return new NextResponse("not found", { status: 404 });
  if (task.user_id !== user.id && !user.is_admin) {
    return new NextResponse("forbidden", { status: 403 });
  }

  // 2. 如果已 succeeded/failed/cancelled → 直接返回(附 file_url)
  if (task.status === "succeeded" || task.status === "failed" || task.status === "cancelled") {
    return NextResponse.json(await withFileUrl(task));
  }

  // 3. status=queued/running → 看是否要 poll
  const now = Date.now();
  const last = task.last_polled_at ? new Date(task.last_polled_at).getTime() : 0;
  if (now - last < POLL_THROTTLE_MS) {
    return NextResponse.json(await withFileUrl(task));
  }

  // 4. 主动 poll 上游
  await supabase
    .from("generation_tasks")
    .update({ last_polled_at: new Date().toISOString() })
    .eq("id", params.id);

  if (!task.easyrouter_task_id) {
    return NextResponse.json(await withFileUrl(task));
  }
  const model = task.model_id ? await getModelById(task.model_id) : null;
  if (!model) return NextResponse.json(await withFileUrl(task));

  let poll;
  try {
    poll = await getTaskStatus(task.easyrouter_task_id, model.provider as Provider);
  } catch (e: unknown) {
    const err = e instanceof GenerationError ? e : new GenerationError("unknown", (e as Error)?.message ?? String(e));
    // 暂态错误不立即标 failed,只在多次失败后 abort(MVP 简化:每次 poll 失败就标 failed)
    await markTaskFailed(params.id, err.message);
    return NextResponse.json(
      await withFileUrl({ ...task, status: "failed", error_message: err.message })
    );
  }

  // 5. 处理 poll 结果
  if (poll.status === "succeeded" && poll.image_b64) {
    // 下载完成 → 落盘 + 写库
    const ext = poll.image_format ?? "mp4";
    const filePath = `/generations/${task.user_id}/${task.id}/result.${ext}`;
    const fileBuffer = Buffer.from(poll.image_b64, "base64");
    await uploadFile(fileBuffer, filePath);

    const fileType = task.type === "video" && !ext.startsWith("svg")
      ? `video/${ext}`
      : ext === "svg" ? "image/svg+xml" : `image/${ext}`;

    const credits_cost = poll.cost_cny != null
      ? Math.round(poll.cost_cny * 100)
      : model.credits_per_unit * (task.duration_seconds ?? 1);
    const cost_cny = poll.cost_cny ?? credits_cost / 100;

    await createResult({
      task_id: task.id,
      file_path: filePath,
      file_type: fileType,
      file_size: fileBuffer.length,
      duration_seconds: task.duration_seconds ?? undefined
    });
    await markTaskSucceeded(task.id, { cost_cny, credits_cost, easyrouter_task_id: task.easyrouter_task_id });
    // V1 加 B(2026-05-29):首次 task succeeded 时回填 conversation.name + 刷 updated_at
    await bumpConversationByTaskId(task.id, task.user_id).catch(() => {});
    await writeAuditLog({
      user_id: task.user_id,
      action: "generate_complete",
      target_type: "generation_task",
      target_id: task.id,
      metadata: { type: task.type, status: "succeeded", credits_cost }
    });

    return NextResponse.json({
      ...(await withFileUrl({ ...task, status: "succeeded", credits_cost, cost_cny })),
      file_url: `/api/files${filePath}`,
      file_type: fileType
    });
  }

  if (poll.status === "failed") {
    await markTaskFailed(task.id, poll.error_message ?? "upstream failed");
    await writeAuditLog({
      user_id: task.user_id,
      action: "generate_complete",
      target_type: "generation_task",
      target_id: task.id,
      metadata: { type: task.type, status: "failed", error: poll.error_message }
    });
    return NextResponse.json(
      await withFileUrl({ ...task, status: "failed", error_message: poll.error_message })
    );
  }

  // running / pending,保持现状
  return NextResponse.json(await withFileUrl(task));
}

// 取消(技术 5.2:不通知上游,只标 cancelled)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();
  const supabase = getServerClient();
  const { data: task } = await supabase
    .from("generation_tasks")
    .select("user_id, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!task) return new NextResponse("not found", { status: 404 });
  if (task.user_id !== user.id) return new NextResponse("forbidden", { status: 403 });
  if (task.status === "succeeded" || task.status === "failed") {
    return new NextResponse("task already completed", { status: 400 });
  }
  await supabase
    .from("generation_tasks")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", params.id);
  await writeAuditLog({
    user_id: user.id,
    action: "task_cancel",
    target_type: "generation_task",
    target_id: params.id,
    ip_address: req.headers.get("x-forwarded-for") ?? null
  });
  return NextResponse.json({ task_id: params.id, status: "cancelled" });
}

async function withFileUrl(task: Record<string, unknown>): Promise<Record<string, unknown>> {
  const supabase = getServerClient();
  // 多图(image output_count=2/4):一条 task 多行 results,按 output_index 升序;主图(idx=0)给 file_url 兼容
  const { data: results } = await supabase
    .from("generation_results")
    .select("file_path, file_type, output_index")
    .eq("task_id", task.id as string)
    .order("output_index", { ascending: true });
  const rows = results ?? [];
  if (rows.length === 0) return task;
  const outputs = await Promise.all(
    rows.map(async r => ({
      file_url: await getSignedUrl(r.file_path as string),
      file_type: r.file_type as string,
      output_index: (r.output_index as number | null) ?? 0
    }))
  );
  const primary = outputs[0];
  return {
    ...task,
    file_url: primary.file_url,
    file_type: primary.file_type,
    outputs
  };
}
