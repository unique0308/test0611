import { randomUUID } from "node:crypto";
import {
  GenerationError,
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerationResult,
  type Ratio
} from "../index";

// aihubmix provider(2026-05-18 Day 3 实测:gpt-image-2 不稳,实际不在用)
// OpenAI 兼容:POST /v1/images/generations,Bearer auth,b64_json 同步返回
// 留作 fallback 供 EASYROUTER_MODE=real + model.provider='aihubmix' 时使用

const IMAGE_TIMEOUT_MS = Number(process.env.EASYROUTER_IMAGE_TIMEOUT_MS) || 120_000;

function getBaseUrl(): string {
  const url = process.env.AIHUBMIX_BASE_URL ?? "https://aihubmix.com/v1";
  return url.replace(/\/+$/, "");
}

function getApiKey(): string {
  const key = process.env.AIHUBMIX_API_KEY;
  if (!key) throw new GenerationError("auth_failed", "AIHUBMIX_API_KEY not set");
  return key;
}

const SIZE_MAP: Record<Ratio, string> = {
  "1:1": "1024x1024",
  "3:4": "1024x1536",
  "4:3": "1536x1024",
  "9:16": "1024x1536",
  "16:9": "1536x1024"
};

function classifyError(httpStatus: number, body: unknown): GenerationError {
  const msg =
    (body as { error?: { message?: string } })?.error?.message ??
    JSON.stringify(body).slice(0, 200);

  if (httpStatus === 401) return new GenerationError("auth_failed", msg, httpStatus, body);
  if (httpStatus === 429) return new GenerationError("rate_limited", msg, httpStatus, body);
  if (httpStatus === 400) {
    if (/incorrect model/i.test(msg) || /not exist/i.test(msg)) {
      return new GenerationError("model_unavailable", msg, httpStatus, body);
    }
    if (/content|policy|violation|safety|审核|敏感/i.test(msg)) {
      return new GenerationError("content_violation", msg, httpStatus, body);
    }
    return new GenerationError("unknown", msg, httpStatus, body);
  }
  if (httpStatus >= 500 && httpStatus < 600) {
    return new GenerationError("upstream_error", msg, httpStatus, body);
  }
  return new GenerationError("unknown", msg, httpStatus, body);
}

export async function generateImage(params: GenerateImageParams): Promise<GenerationResult> {
  const taskId = randomUUID();
  const size = SIZE_MAP[params.ratio];

  const requestBody: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size
  };
  if (params.reference_image_url) requestBody.reference_image_url = params.reference_image_url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(`${getBaseUrl()}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (e: unknown) {
    clearTimeout(timer);
    if ((e as Error)?.name === "AbortError") {
      throw new GenerationError("timeout", `[aihubmix] image generation timed out after ${IMAGE_TIMEOUT_MS}ms`);
    }
    throw new GenerationError("upstream_error", (e as Error)?.message ?? String(e));
  }
  clearTimeout(timer);

  if (!resp.ok) {
    let bodyJson: unknown;
    try { bodyJson = await resp.json(); } catch { bodyJson = await resp.text().catch(() => null); }
    throw classifyError(resp.status, bodyJson);
  }

  const data = (await resp.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    output_format?: string;
    usage?: Record<string, unknown>;
  };

  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    throw new GenerationError(
      "unknown",
      "[aihubmix] response missing data[0].b64_json",
      resp.status,
      data
    );
  }

  return {
    task_id: taskId,
    status: "succeeded",
    image_b64: b64,
    image_format: data.output_format ?? "png",
    cost_cny: undefined, // aihubmix 不返回 cost,Route Handler 用 models.credits_per_unit 估算
    raw_usage: data.usage
  };
}

export async function generateVideo(_params: GenerateVideoParams): Promise<GenerationResult> {
  throw new GenerationError(
    "model_unavailable",
    "[aihubmix] no video models available as of 2026-05-18"
  );
}

export async function getTaskStatus(taskId: string): Promise<GenerationResult> {
  throw new GenerationError(
    "unknown",
    `[aihubmix] getTaskStatus(${taskId}): image is sync, video pending`
  );
}
