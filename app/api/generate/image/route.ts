import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  createTask,
  markTaskRunning,
  markTaskSucceeded,
  markTaskFailed,
  createResults,
  getModelById,
  getDepartmentQuotaSnapshot,
  writeAuditLog,
  cleanupStaleAndCountActive,
  ActiveTaskExistsError,
  ensureDefaultConversation,
  getConversationForUser,
  bumpConversationOnTask,
  type ResultRow
} from "@/lib/db/queries";
import { generateImage, GenerationError, KNOWN_PROVIDERS, type Provider, type Ratio } from "@/lib/easyrouter";
import { validateAndDecodeDataUrl } from "@/lib/easyrouter/data-url-validator";
import { imageDimensions } from "@/lib/image-dimensions";
import { uploadFile } from "@/lib/storage";

// POST /api/generate/image
// Body: { model_id, prompt, ratio, purpose_tag_id }
// 流程(技术 5.1 / 5.3 / 5.4 / 5.5):
//   1. requireAuth
//   2. 取 model row(校验 type=image / enabled)
//   3. 配额校验(soft warning,不阻止)
//   4. createTask(queued)
//   5. audit_logs.generate_start
//   6. markTaskRunning + easyrouter.generateImage
//   7. storage.uploadFile (./uploads/generations/{user_id}/{task_id}/result.{ext})
//   8. createResult + markTaskSucceeded(cost_cny + credits_cost)
//   9. audit_logs.generate_complete
//  10. 返回 file_url + cost + quota_warning

const VALID_RATIOS: Ratio[] = ["1:1", "3:4", "4:3", "9:16", "16:9"];
// KNOWN_PROVIDERS 从 @/lib/easyrouter 复用,避免 lib 加 provider 时这里要同步改两份
// V1.10 Q-V1-09:默认 1 张,允许 1/2/4
const VALID_OUTPUT_COUNTS = [1, 2, 4] as const;

function isProvider(p: unknown): p is Provider {
  return typeof p === "string" && (KNOWN_PROVIDERS as readonly string[]).includes(p);
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();

  let body: {
    model_id?: string;
    prompt?: string;
    ratio?: string;
    purpose_tag_id?: string;
    reference_image_url?: string;
    output_count?: number; // V1.10 1/2/4,默认 1
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
  if (!body.purpose_tag_id) return jsonError("invalid_body", "purpose_tag_id 必填", 400);

  // 025 · M5 P1 波 3:other_note 客户端可绕过,server fail-safe 限长 20 + trim
  // 非 string / 超长 → 截断不报错(前端 client 已 maxLength 限制,这里 defensive)
  const otherNote = typeof body.other_note === "string" ? body.other_note.trim().slice(0, 20) : "";

  // V1.10 output_count 校验,默认 1
  const outputCount = body.output_count ?? 1;
  if (!(VALID_OUTPUT_COUNTS as readonly number[]).includes(outputCount)) {
    return jsonError("invalid_body", "output_count 必须是 1/2/4", 400);
  }

  // 校验 reference_image_url(可选,data URL only)
  let referenceImageMeta: { ext: string; size: number; mime: string; buffer: Buffer } | null = null;
  if (body.reference_image_url) {
    const v = validateAndDecodeDataUrl(body.reference_image_url);
    if ("error" in v) return jsonError("invalid_body", v.error, 400);
    referenceImageMeta = v;
  }

  const model = await getModelById(body.model_id);
  if (!model) return jsonError("model_unavailable", "模型不存在", 404);
  if (model.type !== "image") return jsonError("invalid_body", "该模型不是图片模型", 400);
  if (!model.enabled) return jsonError("model_unavailable", "该模型已下线", 403);
  if (!isProvider(model.provider)) {
    return jsonError("model_unavailable", `未知 provider: ${model.provider}`, 500);
  }

  // 单用户并发限制(技术 5.4):同一时刻只能 1 个 queued|running task
  // Day 45 续³ 兜底:同时自动清理超阈值(image 2min)的卡死任务,避免永久占锁
  const active = await cleanupStaleAndCountActive(user.id);
  if (active >= 1) {
    return jsonError("rate_limited", "上一个还在生成,请稍后再试", 429);
  }

  // 配额(soft warning,不阻止)
  const quota = user.department_id
    ? await getDepartmentQuotaSnapshot(user.department_id)
    : { used_credits: 0, limit_credits: 5000, ratio: 0, warning: "green" as const };

  // 参考图落盘备份(留审计;OpenRouter 用 data URL 直传,不需要存储 URL)
  let referenceStoragePath: string | null = null;
  if (referenceImageMeta) {
    const ts = Date.now();
    referenceStoragePath = `/references/${user.id}/${ts}.${referenceImageMeta.ext}`;
    try {
      await uploadFile(referenceImageMeta.buffer, referenceStoragePath);
    } catch (e) {
      return jsonError("upstream_error", `参考图保存失败: ${(e as Error).message}`, 500);
    }
  }

  // 取 purpose_tag 名称作快照(简化:从 client 传过来的 id,再查名称)
  const purposeName = await fetchPurposeTagName(body.purpose_tag_id);
  if (!purposeName) return jsonError("invalid_body", "purpose_tag_id 无效", 400);

  // V1 加 B(2026-05-29):resolve conversation_id
  // body 传了 → 校验归属 + 未软删;未传或无效 → ensureDefaultConversation 兜底
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

  // 1. 创建 task(DB 部分唯一索引兜底并发,application 层 countActiveTasks 已 fast-path)
  let taskId: string;
  try {
    taskId = await createTask({
      user_id: user.id,
      department_id: user.department_id,
      department_name: user.department_name,
      type: "image",
      model_id: model.id,
      model_name: model.name,
      prompt: body.prompt.trim(),
      ratio: body.ratio,
      duration_seconds: null,
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
    // 025 · M5 P1 波 3:"其他"短文本搭车 metadata.other_note,admin 后续 query:
    //   SELECT metadata->>'other_note' AS note, COUNT(*) FROM audit_logs
    //   WHERE action='generate_start' AND metadata->>'other_note' IS NOT NULL GROUP BY note
    metadata: {
      type: "image",
      model: model.name,
      ratio: body.ratio,
      ...(otherNote ? { other_note: otherNote } : {})
    },
    ip_address: req.headers.get("x-forwarded-for") ?? null
  });

  // 2026-05-28 异步化:POST 立即返 task_id,生成在 background 跑,前端轮询 GET /api/tasks/{id}
  // 目的:让图片跟视频流程统一,跨页面切换 pending 卡能被 sessionStorage 持久化 + 恢复轮询
  // 用 fire-and-forget IIFE — Next.js Node runtime (PM2 / 传统部署) 会让 handler 返回后
  // promise 继续跑;serverless 环境(vercel)不适用,本项目用 PM2 见 ecosystem.config.js
  void (async () => {
    try {
      await markTaskRunning(taskId);

      // V1.10 并行调 N 次 easyrouter(N=output_count;Q-V1-13:任一失败整体失败)
      const gens = await Promise.all(
        Array.from({ length: outputCount }, () =>
          generateImage({
            provider: model.provider as Provider,
            model: model.easyrouter_model_key,
            prompt: body.prompt!.trim(),
            ratio: body.ratio as Ratio,
            reference_image_url: body.reference_image_url
          })
        )
      );

      // 落盘 N 个文件,主图 result.{ext} 兼容 batch-download / 历史页
      const resultRows: ResultRow[] = [];
      for (let i = 0; i < gens.length; i++) {
        const gen = gens[i];
        const ext = gen.image_format ?? "png";
        const filePath = i === 0
          ? `/generations/${user.id}/${taskId}/result.${ext}`
          : `/generations/${user.id}/${taskId}/result_${i}.${ext}`;
        if (!gen.image_b64) throw new Error(`output #${i} 无图片字节`);
        const buf = Buffer.from(gen.image_b64, "base64");
        await uploadFile(buf, filePath);
        const real = imageDimensions(buf);
        const fallback = parseSize(body.ratio as Ratio);
        resultRows.push({
          task_id: taskId,
          file_path: filePath,
          file_type: `image/${ext}`,
          file_size: buf.length,
          width: real?.width ?? fallback.w,
          height: real?.height ?? fallback.h,
          output_index: i
        });
      }

      // cost 累加(每张图独立 cost_cny 或按 credits_per_unit 估算)
      let credits_cost = 0;
      let cost_cny_total = 0;
      for (const gen of gens) {
        if (gen.cost_cny != null) {
          credits_cost += Math.round(gen.cost_cny * 100);
          cost_cny_total += gen.cost_cny;
        } else {
          credits_cost += model.credits_per_unit;
          cost_cny_total += model.credits_per_unit / 100;
        }
      }

      await createResults(resultRows);
      await markTaskSucceeded(taskId, {
        cost_cny: cost_cny_total,
        credits_cost,
        easyrouter_task_id: gens[0]?.task_id
      });
      // V1 加 B:首次 task 完成回填 conversation.name(prompt 前 18 字截断),刷新 updated_at
      await bumpConversationOnTask(conversationId, user.id, body.prompt!.trim()).catch(() => {});
      await writeAuditLog({
        user_id: user.id,
        action: "generate_complete",
        target_type: "generation_task",
        target_id: taskId,
        metadata: { type: "image", status: "succeeded", credits_cost, output_count: outputCount }
      });
    } catch (e: unknown) {
      // 任何环节抛错 → markTaskFailed,前端轮询 GET 会看到 failed + error_message
      // 写入 friendlyMessage(中文用户文案)而非原始上游错误(英文/技术栈),让 SkeletonResult 错误卡可读
      const err = toGenerationError(e);
      const friendly = friendlyMessage(err);
      try {
        await markTaskFailed(taskId, friendly);
        await writeAuditLog({
          user_id: user.id,
          action: "generate_complete",
          target_type: "generation_task",
          target_id: taskId,
          metadata: { type: "image", status: "failed", error_code: err.code, error: err.message, output_count: outputCount }
        });
      } catch {
        // markTaskFailed 失败也吞掉 — stale 阈值(2min)兜底会清
      }
    }
  })();

  // 立即返回 — 前端拿到 task_id + status:"running" 启动轮询(同视频流程)
  // credits_cost / used_credits_after / quota_warning 在 task succeeded 后由 GET /api/tasks/{id} 返回
  return NextResponse.json({
    task_id: taskId,
    status: "running",
    type: "image",
    reference_image_url: referenceStoragePath ? `/api/files${referenceStoragePath}` : null,
    output_count: outputCount
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

import { getServerClient } from "@/lib/supabase/server";

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
    case "auth_failed":
      return "模型服务认证失败,请联系管理员";
    case "rate_limited":
      return "系统繁忙,请稍后重试";
    case "content_violation":
      return `内容审核未通过:${err.message}`;
    case "model_unavailable":
      return "所选模型当前不可用,请换一个";
    case "upstream_error":
      return "生成服务暂时不可用";
    case "timeout":
      return "生成超时,请稍后重试";
    default:
      return "生成失败,请重试";
  }
}

function parseSize(ratio: Ratio): { w: number; h: number } {
  const map: Record<Ratio, { w: number; h: number }> = {
    "1:1": { w: 1024, h: 1024 },
    "3:4": { w: 768, h: 1024 },
    "4:3": { w: 1024, h: 768 },
    "9:16": { w: 576, h: 1024 },
    "16:9": { w: 1024, h: 576 }
  };
  return map[ratio];
}
