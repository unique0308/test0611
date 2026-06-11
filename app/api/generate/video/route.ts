import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  createTask,
  markTaskRunning,
  markTaskFailed,
  getModelById,
  getDepartmentQuotaSnapshot,
  writeAuditLog,
  cleanupStaleAndCountActive,
  ActiveTaskExistsError,
  ensureDefaultConversation,
  getConversationForUser
} from "@/lib/db/queries";
import { generateVideo, GenerationError, KNOWN_PROVIDERS, type Provider, type Ratio } from "@/lib/easyrouter";
import { validateAndDecodeDataUrl } from "@/lib/easyrouter/data-url-validator";
import { getServerClient } from "@/lib/supabase/server";

// POST /api/generate/video
// Body: { model_id, prompt, ratio, duration_seconds (5|10), purpose_tag_id }
//
// 视频走异步:
//   1. 创建 task(queued)
//   2. easyrouter.generateVideo → 上游 task id(openrouter id)
//   3. markTaskRunning + 记 easyrouter_task_id
//   4. 返回 { task_id, status: "running" } → 前端轮询 /api/tasks/{id}
//
// 真正下载视频 + 落盘在 GET /api/tasks/{id} 的被动查询里完成

const VALID_RATIOS: Ratio[] = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const VALID_DURATIONS = [5, 10] as const;
// KNOWN_PROVIDERS 从 @/lib/easyrouter 复用,避免 lib 加 provider 时这里要同步改两份

function isProvider(p: unknown): p is Provider {
  return typeof p === "string" && (KNOWN_PROVIDERS as readonly string[]).includes(p);
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();

  let body: {
    model_id?: string;
    prompt?: string;
    ratio?: string;
    duration_seconds?: number;
    purpose_tag_id?: string;
    // V1.9 图生视频:可选 data URL(`data:image/(png|jpeg|webp);base64,...`)
    reference_image_url?: string;
    conversation_id?: string; // V1 加 B(2026-05-29):可选,空/无效时兜底默认创作
    other_note?: string; // 025 · M5 P1 波 3:"其他"短文本(<20 字),仅 purpose=其他 时记 audit_log
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", "请求体不是合法 JSON", 400);
  }

  if (!body.model_id) return jsonError("invalid_body", "model_id 必填", 400);
  if (!body.prompt?.trim()) return jsonError("invalid_body", "prompt 必填", 400);
  if (!body.ratio || !VALID_RATIOS.includes(body.ratio as Ratio)) {
    return jsonError("invalid_body", "ratio 必须是 1:1/3:4/4:3/9:16/16:9", 400);
  }
  if (!body.duration_seconds || !VALID_DURATIONS.includes(body.duration_seconds as 5 | 10)) {
    return jsonError("invalid_body", "duration_seconds 必须是 5 或 10", 400);
  }
  if (!body.purpose_tag_id) return jsonError("invalid_body", "purpose_tag_id 必填", 400);

  // 025 · M5 P1 波 3:other_note fail-safe(server 截断 20,不报错)
  const otherNote = typeof body.other_note === "string" ? body.other_note.trim().slice(0, 20) : "";

  // V1.9 reference_image_url 校验(可选,data URL only,≤ 20MB);同 image route validator
  let referenceImageMeta: { ext: string; size: number; mime: string; buffer: Buffer } | null = null;
  if (body.reference_image_url) {
    const v = validateAndDecodeDataUrl(body.reference_image_url);
    if ("error" in v) return jsonError("invalid_body", v.error, 400);
    referenceImageMeta = v;
  }

  const model = await getModelById(body.model_id);
  if (!model) return jsonError("model_unavailable", "模型不存在", 404);
  if (model.type !== "video") return jsonError("invalid_body", "该模型不是视频模型", 400);
  if (!model.enabled) return jsonError("model_unavailable", "该模型已下线", 403);
  if (!isProvider(model.provider)) {
    return jsonError("model_unavailable", `未知 provider: ${model.provider}`, 500);
  }

  // Day 45 续³ 兜底:同时自动清理超阈值(video 5min)的卡死任务,避免永久占锁
  const active = await cleanupStaleAndCountActive(user.id);
  if (active >= 1) {
    return jsonError("rate_limited", "上一个还在生成,请稍后再试", 429);
  }

  await getDepartmentQuotaSnapshot(user.department_id ?? "00000000-0000-0000-0000-000000000000");

  const purposeName = await fetchPurposeTagName(body.purpose_tag_id);
  if (!purposeName) return jsonError("invalid_body", "purpose_tag_id 无效", 400);

  // V1 加 B(2026-05-29):resolve conversation_id(同 image route)
  // 024 · M5 P1 波 2:同时校验 conv.primary_purpose_tag_id 非 NULL(D16 必选 blocking)
  let conv;
  if (body.conversation_id) {
    const found = await getConversationForUser(body.conversation_id, user.id);
    conv = found ?? (await ensureDefaultConversation(user.id));
  } else {
    conv = await ensureDefaultConversation(user.id);
  }
  if (!conv.primary_purpose_tag_id) {
    return jsonError("primary_tag_missing", "请先在会话头部选择主标签后再生成", 400);
  }
  const conversationId = conv.id;

  // V1.9 参考图落盘备份(留审计;easyrouter 用 data URL 直传,storage path 仅做归档)
  let referenceStoragePath: string | null = null;
  if (referenceImageMeta) {
    const ts = Date.now();
    referenceStoragePath = `/references/${user.id}/${ts}.${referenceImageMeta.ext}`;
    try {
      await uploadFile(referenceImageMeta.buffer, referenceStoragePath);
    } catch (e) {
      return jsonError("upstream_error", `参考图落盘失败: ${(e as Error).message}`, 500);
    }
  }

  // 1. 创建 task(DB 部分唯一索引兜底并发)
  let taskId: string;
  try {
    taskId = await createTask({
      user_id: user.id,
      department_id: user.department_id,
      department_name: user.department_name,
      type: "video",
      model_id: model.id,
      model_name: model.name,
      prompt: body.prompt.trim(),
      ratio: body.ratio,
      duration_seconds: body.duration_seconds,
      purpose_tag_id: body.purpose_tag_id,
      purpose_tag_name: purposeName,
      reference_image_url: referenceStoragePath,
      conversation_id: conversationId
    });
  } catch (e) {
    if (e instanceof ActiveTaskExistsError) {
      return jsonError("rate_limited", "上一个还在生成,请稍后再试", 429);
    }
    return jsonError("upstream_error", `创建任务失败: ${(e as Error).message}`, 500);
  }

  await writeAuditLog({
    user_id: user.id,
    action: "generate_start",
    target_type: "generation_task",
    target_id: taskId,
    // 025 · M5 P1 波 3:"其他"短文本搭车 metadata.other_note(查询见 image route 同条注释)
    metadata: {
      type: "video",
      model: model.name,
      ratio: body.ratio,
      duration: body.duration_seconds,
      ...(otherNote ? { other_note: otherNote } : {})
    }
  });

  // 2. 调上游创建视频任务
  let gen;
  try {
    gen = await generateVideo({
      provider: model.provider as Provider,
      model: model.easyrouter_model_key,
      prompt: body.prompt.trim(),
      ratio: body.ratio as Ratio,
      duration_seconds: body.duration_seconds as 5 | 10,
      // V1.9 图生视频:传 data URL 给 provider,easyrouter provider 设置 body.image 字段
      reference_image_url: body.reference_image_url
    });
  } catch (e: unknown) {
    const err = toGenerationError(e);
    await markTaskFailed(taskId, err.message);
    await writeAuditLog({
      user_id: user.id,
      action: "generate_complete",
      target_type: "generation_task",
      target_id: taskId,
      metadata: { type: "video", status: "failed", error_code: err.code, error: err.message }
    });
    return jsonError(err.code, friendlyMessage(err), httpFromCode(err.code, err.httpStatus));
  }

  // 3. 标 running + 存上游 task id(供 GET /api/tasks/{id} 轮询用)
  const supabase = getServerClient();
  await supabase
    .from("generation_tasks")
    .update({
      status: "running",
      easyrouter_task_id: gen.task_id
    })
    .eq("id", taskId);

  // 4. mock 模式特殊:mock-client.generateVideo 直接返回 succeeded + image_b64
  // 这种情况下 Route Handler 同步处理一次落盘
  const referenceServedUrl = referenceStoragePath ? `/api/files${referenceStoragePath}` : null;
  if (gen.status === "succeeded" && gen.image_b64) {
    return finalizeSucceeded(
      taskId,
      user.id,
      gen,
      model.credits_per_unit,
      body.duration_seconds as 5 | 10,
      referenceServedUrl
    );
  }

  return NextResponse.json({
    task_id: taskId,
    status: "running",
    type: "video",
    provider_task_id: gen.task_id,
    // 参考图(图生视频)— 落盘备份的服务 URL,供 feed 卡片展示小预览
    reference_image_url: referenceServedUrl
  });
}

// ─── 同步路径(mock 模式)──────────────────────────────────────────────
import { uploadFile } from "@/lib/storage";
import { createResult, markTaskSucceeded } from "@/lib/db/queries";
import type { GenerationResult } from "@/lib/easyrouter";

async function finalizeSucceeded(
  taskId: string,
  userId: string,
  gen: GenerationResult,
  creditsPerUnit: number,
  duration: 5 | 10,
  referenceServedUrl: string | null
) {
  if (!gen.image_b64) {
    await markTaskFailed(taskId, "provider returned succeeded but no bytes");
    return jsonError("upstream_error", "生成完成但未返回数据", 502);
  }
  const ext = gen.image_format ?? "mp4";
  const filePath = `/generations/${userId}/${taskId}/result.${ext}`;
  const fileBuffer = Buffer.from(gen.image_b64, "base64");
  await uploadFile(fileBuffer, filePath);

  const credits_cost = gen.cost_cny != null ? Math.round(gen.cost_cny * 100) : creditsPerUnit * duration;
  const cost_cny = gen.cost_cny ?? credits_cost / 100;

  await createResult({
    task_id: taskId,
    file_path: filePath,
    file_type: ext.startsWith("svg") ? "image/svg+xml" : `video/${ext}`,
    file_size: fileBuffer.length,
    duration_seconds: duration
  });
  await markTaskSucceeded(taskId, { cost_cny, credits_cost, easyrouter_task_id: gen.task_id });
  await writeAuditLog({
    user_id: userId,
    action: "generate_complete",
    target_type: "generation_task",
    target_id: taskId,
    metadata: { type: "video", status: "succeeded", credits_cost }
  });

  return NextResponse.json({
    task_id: taskId,
    status: "succeeded",
    type: "video",
    file_url: `/api/files${filePath}`,
    file_type: ext.startsWith("svg") ? "image/svg+xml" : `video/${ext}`,
    reference_image_url: referenceServedUrl,
    cost_cny,
    credits_cost
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchPurposeTagName(tagId: string): Promise<string | null> {
  const s = getServerClient();
  const { data } = await s.from("purpose_tags").select("name").eq("id", tagId).maybeSingle();
  return data?.name ?? null;
}

function jsonError(code: string, message: string, httpStatus: number) {
  return NextResponse.json({ error: { code, message } }, { status: httpStatus });
}

function toGenerationError(e: unknown): GenerationError {
  if (e instanceof GenerationError) return e;
  return new GenerationError("unknown", (e as Error)?.message ?? String(e));
}

function friendlyMessage(err: GenerationError): string {
  switch (err.code) {
    case "auth_failed":      return "视频服务认证失败,请联系管理员";
    case "rate_limited":     return "系统繁忙,请稍后重试";
    case "content_violation": return `内容审核未通过:${err.message}`;
    case "model_unavailable": return "视频模型当前不可用";
    case "upstream_error":   return "视频服务暂时不可用";
    case "timeout":          return "提交视频任务超时,请稍后重试";
    default:                 return "视频生成失败,请重试";
  }
}

function httpFromCode(code: string, raw?: number): number {
  if (raw && raw >= 400 && raw < 600) return raw;
  if (code === "auth_failed") return 502;
  if (code === "rate_limited") return 429;
  if (code === "content_violation") return 400;
  if (code === "model_unavailable") return 503;
  if (code === "timeout") return 504;
  return 500;
}

