import { randomUUID } from "node:crypto";
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from "undici";
import {
  GenerationError,
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerationResult,
  type Ratio
} from "../index";

// OpenRouter provider
//
// 2026-05-18 Day 3.5 实测发现:
//   - OpenRouter 对中国大陆 IP **全面禁用图片生成模型**(Gemini + OpenAI 都 403
//     "This model is not available in your region")
//   - 本机 curl 通是因为 shell 设了代理(http://127.0.0.1:7890)
//   - Node fetch 默认不读 shell 代理 → 直连 OpenRouter → 403
//   - 解决:读 HTTPS_PROXY / https_proxy env,用 undici.ProxyAgent
//   - ⚠️ 生产部署到中国大陆服务器时,**OpenRouter 图片仍然不可用**(国内 IP 直连 403)
//     生产必须切国产 provider(火山方舟 / 百炼 / 硅基流动)
//
// 图片走 chat completions API(不是 /images/generations)
// 返回:choices[0].message.images[0].image_url.url(data:image/png;base64,...)
// 没有视频模型(2026-05-18)

const IMAGE_TIMEOUT_MS =
  Number(process.env.OPENROUTER_IMAGE_TIMEOUT_MS) ||
  Number(process.env.EASYROUTER_IMAGE_TIMEOUT_MS) ||
  120_000;
const BASE_URL = "https://openrouter.ai/api/v1";

// 1 USD ≈ 7.2 CNY(粗略;OpenRouter 余额是 USD,显示给员工的积分按当前汇率算)
const USD_TO_CNY = Number(process.env.USD_TO_CNY) || 7.2;

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new GenerationError("auth_failed", "OPENROUTER_API_KEY not set");
  return key;
}

// 读 shell 代理 env,让 dev 期 fetch 也能过墙
// 生产部署到中国大陆服务器时仍然不可用,见文件头注释
let proxyDispatcher: Dispatcher | undefined;
function getProxyDispatcher(): Dispatcher | undefined {
  if (proxyDispatcher !== undefined) return proxyDispatcher;
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (proxy && /^https?:\/\//i.test(proxy)) {
    proxyDispatcher = new ProxyAgent(proxy);
  }
  return proxyDispatcher;
}

// OpenRouter 的 Gemini Flash Image 通过 chat 输出,自身决定尺寸
// 我们在 prompt 里附加 ratio 提示,模型尽量遵守
const RATIO_HINT: Record<Ratio, string> = {
  "1:1": "square (1:1) aspect ratio",
  "3:4": "portrait (3:4) aspect ratio",
  "4:3": "landscape (4:3) aspect ratio",
  "9:16": "tall vertical (9:16) aspect ratio, mobile-friendly",
  "16:9": "widescreen (16:9) aspect ratio, cinematic"
};

function classifyError(httpStatus: number, body: unknown): GenerationError {
  const msg =
    (body as { error?: { message?: string } })?.error?.message ??
    JSON.stringify(body).slice(0, 200);

  if (httpStatus === 401) return new GenerationError("auth_failed", msg, httpStatus, body);
  if (httpStatus === 402) return new GenerationError("auth_failed", `[openrouter] 余额不足: ${msg}`, httpStatus, body);
  if (httpStatus === 429) return new GenerationError("rate_limited", msg, httpStatus, body);
  if (httpStatus === 400) {
    if (/not a valid model/i.test(msg) || /not exist/i.test(msg) || /unknown model/i.test(msg)) {
      return new GenerationError("model_unavailable", msg, httpStatus, body);
    }
    if (/content|policy|violation|safety|moderation|审核|敏感/i.test(msg)) {
      return new GenerationError("content_violation", msg, httpStatus, body);
    }
    return new GenerationError("unknown", msg, httpStatus, body);
  }
  if (httpStatus >= 500 && httpStatus < 600) {
    return new GenerationError("upstream_error", msg, httpStatus, body);
  }
  return new GenerationError("unknown", msg, httpStatus, body);
}

type ChatResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
      images?: Array<{ type: string; image_url?: { url?: string } }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number; // USD,OpenRouter 实测会返回
    cost_details?: Record<string, unknown>;
    completion_tokens_details?: Record<string, unknown>;
  };
};

// data URL → { b64, format }
function parseDataUrl(url: string): { b64: string; format: string } {
  const m = url.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!m) throw new GenerationError("unknown", `[openrouter] image_url is not a data URL: ${url.slice(0, 80)}`);
  return { format: m[1].toLowerCase(), b64: m[2] };
}

export async function generateImage(params: GenerateImageParams): Promise<GenerationResult> {
  const taskId = randomUUID();

  const userText = params.reference_image_url
    ? `Generate an image based on this reference, with ${RATIO_HINT[params.ratio]}. Prompt: ${params.prompt}`
    : `Generate an image with ${RATIO_HINT[params.ratio]}. Prompt: ${params.prompt}`;

  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: userText }];
  if (params.reference_image_url) {
    userContent.push({ type: "image_url", image_url: { url: params.reference_image_url } });
  }

  const requestBody = {
    model: params.model,
    messages: [{ role: "user", content: userContent }],
    modalities: ["image", "text"]
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  let resp: Response;
  try {
    // 走 undici fetch + ProxyAgent(读 shell HTTPS_PROXY),否则中国大陆 403
    resp = (await undiciFetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      dispatcher: getProxyDispatcher()
    })) as unknown as Response;
  } catch (e: unknown) {
    clearTimeout(timer);
    if ((e as Error)?.name === "AbortError") {
      throw new GenerationError("timeout", `[openrouter] image generation timed out after ${IMAGE_TIMEOUT_MS}ms`);
    }
    throw new GenerationError("upstream_error", (e as Error)?.message ?? String(e));
  }
  clearTimeout(timer);

  if (!resp.ok) {
    let bodyJson: unknown;
    try { bodyJson = await resp.json(); } catch { bodyJson = await resp.text().catch(() => null); }
    throw classifyError(resp.status, bodyJson);
  }

  const data = (await resp.json()) as ChatResponse;
  const firstChoice = data.choices?.[0];
  const firstImage = firstChoice?.message?.images?.[0];
  const url = firstImage?.image_url?.url;

  if (!url) {
    throw new GenerationError(
      "unknown",
      "[openrouter] response missing choices[0].message.images[0].image_url.url",
      resp.status,
      data
    );
  }

  const { b64, format } = parseDataUrl(url);
  const costUsd = data.usage?.cost;
  const costCny = typeof costUsd === "number" ? Number((costUsd * USD_TO_CNY).toFixed(4)) : undefined;

  return {
    task_id: taskId,
    status: "succeeded",
    image_b64: b64,
    image_format: format,
    cost_cny: costCny,
    raw_usage: data.usage as Record<string, unknown> | undefined
  };
}

// ─── Video generation(异步:create → poll → download)─────────────────────
//
// 2026-05-18 实测确认:
//   POST /api/v1/videos { model, prompt, [aspect_ratio], [duration_seconds] }
//     → 202 { id, polling_url, status: "pending" }
//   GET  /api/v1/videos/{id}  (即 polling_url)
//     → { status: "pending"|"running"|"completed"|"failed", unsigned_urls?, usage?: {cost} }
//   GET  /api/v1/videos/{id}/content?index=0  + Bearer auth
//     → binary video/mp4
//
// 任务流:
//   POST /api/generate/video                         → 创建 task,返回 status=running
//   GET  /api/tasks/{id}(被动查询)每 3 秒          → 后端去 OpenRouter 轮询
//     completed: 下载 binary → storage 落盘 → markTaskSucceeded
//     failed:    markTaskFailed
//
// generateVideo 只做"create + 返回 provider task id";轮询 + 下载放在 getTaskStatus

const VIDEO_CREATE_TIMEOUT_MS = 60_000;

export async function generateVideo(params: GenerateVideoParams): Promise<GenerationResult> {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    aspect_ratio: params.ratio,
    duration_seconds: params.duration_seconds
  };
  // 图生视频(reference_image)由 GenerateVideoParams 后续扩展支持,MVP 暂不传
  //
  // ⚠️ TODO 待嘉斌选用 10s 真测一次:Day 38 末 easyrouter.io 实测,`duration_seconds`
  //   字段对 dreamina-seedance-2-0-fast 无效(10s 实际出 5s),需走 prompt token
  //   `--dur 10`(Seedance 官方 control token)。OpenRouter 的 bytedance/seedance-2.0-fast
  //   只测过 5s,**未验证 10s 是否同样存在该 bug**。若复现,这里也得改成 prompt 拼 --dur。

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIDEO_CREATE_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = (await undiciFetch(`${BASE_URL}/videos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      dispatcher: getProxyDispatcher()
    })) as unknown as Response;
  } catch (e: unknown) {
    clearTimeout(timer);
    if ((e as Error)?.name === "AbortError") {
      throw new GenerationError("timeout", "[openrouter] video create timed out");
    }
    throw new GenerationError("upstream_error", (e as Error)?.message ?? String(e));
  }
  clearTimeout(timer);

  if (!resp.ok) {
    let bodyJson: unknown;
    try { bodyJson = await resp.json(); } catch { bodyJson = await resp.text().catch(() => null); }
    throw classifyError(resp.status, bodyJson);
  }

  const data = (await resp.json()) as { id?: string; polling_url?: string; status?: string };
  if (!data.id) {
    throw new GenerationError("unknown", "[openrouter] video create response missing id", resp.status, data);
  }

  // 用 OpenRouter task id 作 task_id;Route Handler 把它存到 generation_tasks.easyrouter_task_id
  return {
    task_id: data.id,
    status: "running",
    cost_cny: undefined,
    raw_usage: undefined
  };
}

type PollResponse = {
  id?: string;
  status?: "pending" | "running" | "completed" | "failed" | string;
  unsigned_urls?: string[];
  usage?: { cost?: number; is_byok?: boolean };
  error?: { message?: string };
};

export async function getTaskStatus(providerTaskId: string): Promise<GenerationResult> {
  // 1) 查状态
  let pollResp: Response;
  try {
    pollResp = (await undiciFetch(`${BASE_URL}/videos/${encodeURIComponent(providerTaskId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
      dispatcher: getProxyDispatcher()
    })) as unknown as Response;
  } catch (e: unknown) {
    throw new GenerationError("upstream_error", `[openrouter] poll failed: ${(e as Error)?.message ?? e}`);
  }
  if (!pollResp.ok) {
    let bodyJson: unknown;
    try { bodyJson = await pollResp.json(); } catch { bodyJson = await pollResp.text().catch(() => null); }
    throw classifyError(pollResp.status, bodyJson);
  }
  const poll = (await pollResp.json()) as PollResponse;

  const status = poll.status ?? "pending";
  if (status === "pending" || status === "running") {
    return { task_id: providerTaskId, status: "running" };
  }
  if (status === "failed") {
    return {
      task_id: providerTaskId,
      status: "failed",
      error_message: poll.error?.message ?? "video generation failed"
    };
  }
  if (status !== "completed") {
    return { task_id: providerTaskId, status: "running" };
  }

  // 2) completed → 下载 video binary
  const url = poll.unsigned_urls?.[0];
  if (!url) {
    return {
      task_id: providerTaskId,
      status: "failed",
      error_message: "[openrouter] completed but no unsigned_urls"
    };
  }
  let binResp: Response;
  try {
    binResp = (await undiciFetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
      dispatcher: getProxyDispatcher()
    })) as unknown as Response;
  } catch (e: unknown) {
    throw new GenerationError("upstream_error", `[openrouter] video download failed: ${(e as Error)?.message ?? e}`);
  }
  if (!binResp.ok) {
    throw new GenerationError("upstream_error", `[openrouter] video download HTTP ${binResp.status}`);
  }
  const arrayBuf = await binResp.arrayBuffer();
  const b64 = Buffer.from(arrayBuf).toString("base64");
  const contentType = binResp.headers.get("content-type") ?? "video/mp4";
  const format = contentType.split("/").pop() ?? "mp4";

  const costUsd = poll.usage?.cost;
  const costCny = typeof costUsd === "number" ? Number((costUsd * USD_TO_CNY).toFixed(4)) : undefined;

  return {
    task_id: providerTaskId,
    status: "succeeded",
    image_b64: b64,         // 字段名沿用 image_b64,但实际承载 mp4 binary
    image_format: format,
    cost_cny: costCny,
    raw_usage: poll.usage as Record<string, unknown> | undefined
  };
}
