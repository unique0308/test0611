import { randomUUID } from "node:crypto";
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from "undici";
import {
  GenerationError,
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerationResult,
  type Ratio
} from "../index";

// easyrouter.io provider(2026-05-19 Day 38 接入,嘉斌补 key,base URL https://easyrouter.io/v1)
//
// 定位:测试用聚合平台,后续买企业服务后更换 key
//
// 跟 OpenRouter 的关键 schema 差异(实测确认):
//   - 图片:走 chat completions,但图片在 message.content 里以 Markdown
//     `![image](data:image/png;base64,...)` 形式,**不是** OpenRouter 的
//     message.images[0].image_url.url
//   - 视频:POST /v1/videos → { id, task_id, status:"queued", progress }
//           GET  /v1/videos/{id} → { status:"queued"|"in_progress"|"completed"|"failed",
//                                    progress, metadata:{ url } }
//           完成后视频文件直接 GET metadata.url(签名 URL,需带 Bearer)
//   - usage:**不返回 cost USD**(只有 token 数),cost_cny 返回 undefined,Route Handler
//     fallback 到 models.credits_per_unit
//
// 代理:跟 OpenRouter 同样的 ProxyAgent 读 HTTPS_PROXY(嘉斌"先加代理保质",
//   easyrouter.io 中国大陆直连情况未知)

const IMAGE_TIMEOUT_MS =
  Number(process.env.EASYROUTER_IMAGE_TIMEOUT_MS) || 120_000;
const VIDEO_CREATE_TIMEOUT_MS = 60_000;

function getBaseUrl(): string {
  return process.env.EASYROUTER_BASE_URL || "https://easyrouter.io/v1";
}

function getApiKey(): string {
  const key = process.env.EASYROUTER_API_KEY;
  if (!key) throw new GenerationError("auth_failed", "EASYROUTER_API_KEY not set");
  return key;
}

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
  if (httpStatus === 402) return new GenerationError("auth_failed", `[easyrouter] 余额不足: ${msg}`, httpStatus, body);
  if (httpStatus === 429) return new GenerationError("rate_limited", msg, httpStatus, body);
  if (httpStatus === 404) return new GenerationError("model_unavailable", msg, httpStatus, body);
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
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: Record<string, unknown>;
};

// 从 message.content 解析 `![image](data:image/png;base64,xxx)`
function parseMarkdownImage(content: string): { b64: string; format: string } {
  const m = content.match(/!\[[^\]]*\]\(data:image\/([a-zA-Z0-9+]+);base64,([^)]+)\)/);
  if (!m) {
    throw new GenerationError(
      "unknown",
      `[easyrouter] response content does not contain markdown image data URL. content prefix: ${content.slice(0, 100)}`
    );
  }
  return { format: m[1].toLowerCase(), b64: m[2] };
}

// OpenAI Image Generation 系列（gpt-image-*, dall-e-*）必须走 /v1/images/generations，
// 而不是 chat completions（chat 接口只服务多模态 LLM 如 Gemini 2.5 Flash Image）。
// 2026-05-27 接入 gpt-image-2 时实测 chat completions 返 "operation is unsupported"。
function isOpenAIImageGenModel(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith("gpt-image-") || m.startsWith("dall-e-");
}

// OpenAI Images API 支持的 size（gpt-image-1/2）：
// 1024x1024 / 1024x1536（纵）/ 1536x1024（横）/ auto
// 把项目内 ratio 映射到这三个标准 size
const OPENAI_IMAGE_SIZE: Record<Ratio, string> = {
  "1:1": "1024x1024",
  "3:4": "1024x1536",
  "9:16": "1024x1536", // 同纵向（OpenAI 不支持更窄）
  "4:3": "1536x1024",
  "16:9": "1536x1024" // 同横向（OpenAI 不支持更宽）
};

export async function generateImage(params: GenerateImageParams): Promise<GenerationResult> {
  // OpenAI Image Generation 系列走专门图片端点
  if (isOpenAIImageGenModel(params.model)) {
    return generateImageViaImagesApi(params);
  }
  // 默认（Gemini 2.5 Flash Image 等多模态 LLM）走 chat completions
  return generateImageViaChatCompletions(params);
}

async function generateImageViaChatCompletions(
  params: GenerateImageParams
): Promise<GenerationResult> {
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
    resp = (await undiciFetch(`${getBaseUrl()}/chat/completions`, {
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
      throw new GenerationError("timeout", `[easyrouter] image generation timed out after ${IMAGE_TIMEOUT_MS}ms`);
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
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new GenerationError(
      "unknown",
      "[easyrouter] response missing choices[0].message.content",
      resp.status,
      data
    );
  }
  const { b64, format } = parseMarkdownImage(content);

  return {
    task_id: taskId,
    status: "succeeded",
    image_b64: b64,
    image_format: format,
    cost_cny: undefined, // easyrouter 不返回 cost,Route Handler 用 models.credits_per_unit 估算
    raw_usage: data.usage
  };
}

// ─── OpenAI Images API 分支（gpt-image-*, dall-e-*）─────────────────────────
//
// 端点：POST /v1/images/generations（OpenAI 兼容，easyrouter 透传）
// Body：{ model, prompt, n, size, response_format?: "b64_json" | "url" }
//   - gpt-image-1/2 默认返回 b64_json，不接受 response_format 字段
//   - dall-e-3 支持 response_format=b64_json（必须显式传）
//   - 不支持 reference_image（参考图 / image-to-image 是 /v1/images/edits 不同端点）

type ImagesApiResponse = {
  created?: number;
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  usage?: Record<string, unknown>;
};

async function generateImageViaImagesApi(
  params: GenerateImageParams
): Promise<GenerationResult> {
  const taskId = randomUUID();

  if (params.reference_image_url) {
    // 参考图功能未在 /v1/images/generations 范围内，要走 /v1/images/edits（不同 schema）。
    // V1 不支持 OpenAI image edits，先 fail-fast 报清楚
    throw new GenerationError(
      "model_unavailable",
      `[easyrouter] ${params.model} 不支持参考图（需走 /v1/images/edits 端点，V1 未实现）`
    );
  }

  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: OPENAI_IMAGE_SIZE[params.ratio]
  };
  // dall-e-3 必须传 response_format=b64_json 才返 base64；gpt-image-1/2 默认就是 b64
  if (params.model.toLowerCase().startsWith("dall-e-")) {
    body.response_format = "b64_json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = (await undiciFetch(`${getBaseUrl()}/images/generations`, {
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
      throw new GenerationError(
        "timeout",
        `[easyrouter] images API timed out after ${IMAGE_TIMEOUT_MS}ms`
      );
    }
    throw new GenerationError("upstream_error", (e as Error)?.message ?? String(e));
  }
  clearTimeout(timer);

  if (!resp.ok) {
    let bodyJson: unknown;
    try {
      bodyJson = await resp.json();
    } catch {
      bodyJson = await resp.text().catch(() => null);
    }
    throw classifyError(resp.status, bodyJson);
  }

  const data = (await resp.json()) as ImagesApiResponse;
  const first = data.data?.[0];
  if (!first?.b64_json) {
    throw new GenerationError(
      "unknown",
      "[easyrouter] images API response missing data[0].b64_json",
      resp.status,
      data
    );
  }

  return {
    task_id: taskId,
    status: "succeeded",
    image_b64: first.b64_json,
    image_format: "png", // OpenAI Images API 默认 PNG
    cost_cny: undefined,
    raw_usage: data.usage
  };
}

// ─── Video generation(异步:create → poll → download)───────────────────────
//
// 实测响应:
//   POST /v1/videos { model, prompt, aspect_ratio }
//     → 200 { id, task_id, object:"video", status:"queued", progress:0, created_at }
//   GET  /v1/videos/{id}
//     → { id, status:"queued"|"in_progress"|"completed"|"failed", progress,
//         created_at, completed_at, metadata:{ url } }
//     url 在 metadata.url(签名 URL,GET 时仍需 Bearer)
//
// ⚠️ 时长控制走 prompt 内 control token,不是 body 字段(2026-05-19 Day 38 末实测):
//   - body 上传 `duration_seconds: 10` → 实测仍出 5s(默认),字段被忽略
//   - body 上传 `duration: 10` → 同上忽略
//   - **正确方式**:prompt 末尾拼接 `--dur 10`(字节 Seedance 官方 control token)
//   - 同类 token:`--rs 480p|720p|1080p` 控制分辨率;V1 不传 rs 用默认 720p

export async function generateVideo(params: GenerateVideoParams): Promise<GenerationResult> {
  // 拼接 --dur token 到 prompt 末尾(防御:用户 prompt 已含 --dur 时不重复加)
  const hasDurToken = /\s--dur\s+\d+/i.test(params.prompt);
  const promptWithDur = hasDurToken
    ? params.prompt
    : `${params.prompt} --dur ${params.duration_seconds}`;

  const body: Record<string, unknown> = {
    model: params.model,
    prompt: promptWithDur,
    aspect_ratio: params.ratio
  };
  // V1.9 图片参考(图生视频)— 实测 body `image` 字段生效(visual diff 几乎完全复现参考图)
  // 其他候选(image_url / reference_image / --rt token)均被忽略或触发 false positive 审核
  if (params.reference_image_url) {
    body.image = params.reference_image_url;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIDEO_CREATE_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = (await undiciFetch(`${getBaseUrl()}/videos`, {
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
      throw new GenerationError("timeout", "[easyrouter] video create timed out");
    }
    throw new GenerationError("upstream_error", (e as Error)?.message ?? String(e));
  }
  clearTimeout(timer);

  if (!resp.ok) {
    let bodyJson: unknown;
    try { bodyJson = await resp.json(); } catch { bodyJson = await resp.text().catch(() => null); }
    throw classifyError(resp.status, bodyJson);
  }

  const data = (await resp.json()) as { id?: string; task_id?: string; status?: string };
  const id = data.id ?? data.task_id;
  if (!id) {
    throw new GenerationError("unknown", "[easyrouter] video create response missing id", resp.status, data);
  }

  return {
    task_id: id,
    status: "running",
    cost_cny: undefined,
    raw_usage: undefined
  };
}

type PollResponse = {
  id?: string;
  status?: "queued" | "in_progress" | "completed" | "failed" | string;
  progress?: number;
  metadata?: { url?: string };
  error?: { message?: string } | string;
};

export async function getTaskStatus(providerTaskId: string): Promise<GenerationResult> {
  // 1) 查状态
  let pollResp: Response;
  try {
    pollResp = (await undiciFetch(`${getBaseUrl()}/videos/${encodeURIComponent(providerTaskId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
      dispatcher: getProxyDispatcher()
    })) as unknown as Response;
  } catch (e: unknown) {
    throw new GenerationError("upstream_error", `[easyrouter] poll failed: ${(e as Error)?.message ?? e}`);
  }
  if (!pollResp.ok) {
    let bodyJson: unknown;
    try { bodyJson = await pollResp.json(); } catch { bodyJson = await pollResp.text().catch(() => null); }
    throw classifyError(pollResp.status, bodyJson);
  }
  const poll = (await pollResp.json()) as PollResponse;

  const status = poll.status ?? "queued";
  if (status === "queued" || status === "in_progress") {
    return { task_id: providerTaskId, status: "running" };
  }
  if (status === "failed") {
    const errMsg =
      typeof poll.error === "string"
        ? poll.error
        : poll.error?.message ?? "video generation failed";
    return { task_id: providerTaskId, status: "failed", error_message: errMsg };
  }
  if (status !== "completed") {
    return { task_id: providerTaskId, status: "running" };
  }

  // 2) completed → 下载 video binary
  const url = poll.metadata?.url;
  if (!url) {
    return {
      task_id: providerTaskId,
      status: "failed",
      error_message: "[easyrouter] completed but metadata.url missing"
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
    throw new GenerationError("upstream_error", `[easyrouter] video download failed: ${(e as Error)?.message ?? e}`);
  }
  if (!binResp.ok) {
    throw new GenerationError("upstream_error", `[easyrouter] video download HTTP ${binResp.status}`);
  }
  const arrayBuf = await binResp.arrayBuffer();
  const b64 = Buffer.from(arrayBuf).toString("base64");
  const contentType = binResp.headers.get("content-type") ?? "video/mp4";
  const format = contentType.split("/").pop() ?? "mp4";

  return {
    task_id: providerTaskId,
    status: "succeeded",
    image_b64: b64,         // 字段名沿用 image_b64,实际承载 mp4 binary(同 OpenRouter)
    image_format: format,
    cost_cny: undefined,    // 没有 USD cost,Route Handler 用 credits_per_unit
    raw_usage: undefined
  };
}
