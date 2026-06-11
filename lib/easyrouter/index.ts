// 模型聚合 API 抽象层 — provider-based 架构
//
// 历史演进:
//   - 决策 11(原):easyrouter 不走 mock,统一直连一家聚合
//   - 2026-05-18 Day 3:aihubmix 实测不稳,切 EASYROUTER_MODE=mock 临时方案
//   - 2026-05-18 Day 3.5:重构为 provider-based(为"企业购买服务后填 key"形态铺路)
//
// 运行时路由规则:
//   1. EASYROUTER_MODE=mock      → 全走 mock-client(不读 provider 字段)
//   2. EASYROUTER_MODE=real      → 按 params.provider 选 providers/{provider}.ts
//      - openrouter:OpenRouter 聚合(实测图片可用,无视频)
//      - volcengine:火山方舟(Seedance 视频),骨架待 key
//      - aihubmix:OpenAI 兼容图片(不稳,留作 fallback)
//      - mock:即使在 real 全局模式下,某条 model 配 provider=mock 也走 mock
//
// 新接入 provider 的工作量:加 providers/<name>.ts + 在本文件 switch 加 1 条 case + 加 env
// 业务代码(Route Handler 等)始终只 import @/lib/easyrouter,不知道 provider 存在

export const RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
export type Ratio = (typeof RATIOS)[number];

export const KNOWN_PROVIDERS = ["openrouter", "volcengine", "aihubmix", "easyrouter", "mock"] as const;
export type Provider = (typeof KNOWN_PROVIDERS)[number];

export type GenerateImageParams = {
  provider: Provider;
  model: string;
  prompt: string;
  ratio: Ratio;
  reference_image_url?: string;
};

export type GenerateVideoParams = {
  provider: Provider;
  model: string;
  prompt: string;
  ratio: Ratio;
  duration_seconds: 5 | 10;
  // V1.9 图片参考(图生视频)— 可选,data URL 或 public URL
  // easyrouter dreamina-seedance-2-0-fast 实测 body `image` 字段生效
  // 视频参考 / 音频参考 实测不支持(等火山方舟 OmniHuman/Veo 等模型),GenerateVideoParams 暂不加
  reference_image_url?: string;
};

export type GenerationStatus = "queued" | "running" | "succeeded" | "failed";

export type GenerationResult = {
  task_id: string;
  status: GenerationStatus;
  image_b64?: string;
  image_format?: string;
  result_url?: string;
  cost_cny?: number;
  raw_usage?: Record<string, unknown>;
  error_message?: string;
};

export type GenerationErrorCode =
  | "auth_failed"
  | "rate_limited"
  | "content_violation"
  | "model_unavailable"
  | "upstream_error"
  | "timeout"
  | "unknown";

export class GenerationError extends Error {
  constructor(
    public code: GenerationErrorCode,
    message: string,
    public httpStatus?: number,
    public raw?: unknown
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

// ─── 路由 ───────────────────────────────────────────────────────────────────
import * as mockClient from "./mock-client";
import * as openrouter from "./providers/openrouter";
import * as volcengine from "./providers/volcengine";
import * as aihubmix from "./providers/aihubmix";
import * as easyrouter from "./providers/easyrouter";

type ProviderImpl = {
  generateImage: (p: GenerateImageParams) => Promise<GenerationResult>;
  generateVideo: (p: GenerateVideoParams) => Promise<GenerationResult>;
  getTaskStatus: (id: string) => Promise<GenerationResult>;
};

function resolveImpl(provider: Provider): ProviderImpl {
  // 全局 mock 模式短路所有 provider
  if (process.env.EASYROUTER_MODE === "mock") return mockClient as ProviderImpl;

  switch (provider) {
    case "openrouter": return openrouter as ProviderImpl;
    case "volcengine": return volcengine as ProviderImpl;
    case "aihubmix":   return aihubmix as ProviderImpl;
    case "easyrouter": return easyrouter as ProviderImpl;
    case "mock":       return mockClient as ProviderImpl;
    default:
      throw new GenerationError("model_unavailable", `unknown provider: ${provider}`);
  }
}

export async function generateImage(p: GenerateImageParams): Promise<GenerationResult> {
  return resolveImpl(p.provider).generateImage(p);
}

export async function generateVideo(p: GenerateVideoParams): Promise<GenerationResult> {
  return resolveImpl(p.provider).generateVideo(p);
}

export async function getTaskStatus(taskId: string, provider: Provider): Promise<GenerationResult> {
  return resolveImpl(provider).getTaskStatus(taskId);
}

export function isMockMode(): boolean {
  return process.env.EASYROUTER_MODE === "mock";
}

export function getProvidersStatus(): Array<{ provider: Provider; configured: boolean; reason?: string }> {
  return [
    { provider: "openrouter", configured: Boolean(process.env.OPENROUTER_API_KEY), reason: "OPENROUTER_API_KEY" },
    { provider: "volcengine", configured: Boolean(process.env.VOLCENGINE_API_KEY), reason: "VOLCENGINE_API_KEY + endpoint id" },
    { provider: "aihubmix",   configured: Boolean(process.env.AIHUBMIX_API_KEY),   reason: "AIHUBMIX_API_KEY" },
    { provider: "easyrouter", configured: Boolean(process.env.EASYROUTER_API_KEY), reason: "EASYROUTER_API_KEY" },
    { provider: "mock",       configured: true }
  ];
}
