import { randomUUID } from "node:crypto";
import {
  GenerationError,
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerationResult,
  type Ratio
} from "./index";

// EASYROUTER_MODE=mock 时的实现
//
// ⚠️ 临时方案(2026-05-18 Day 3 决议):
//   原决策 11 明确"easyrouter 不走 mock",但实测 aihubmix 唯一可用图片模型
//   gpt-image-2 在个人号下 4 调用 3 hung;切到 mock 让 Day 4-5 主线不阻塞
//   嘉斌补 key 后改 EASYROUTER_MODE=real,切换路径见 ../MVP跟踪文档/后期补全清单.md #3.5
//
// 占位策略:
//   - 图片:返回 1024×1024 SVG(含 prompt/model/ratio 文本),storage 落盘扩展名 .svg
//   - 视频:同样返回 SVG 帧 + 时长 metadata(Day 6-7 真正的视频接入时改)
//   - cost_cny:返回固定 0.30 ¥ ≈ 30 积分,跟原 Seedream baseline 数值持平

const RATIO_TO_DIMENSIONS: Record<Ratio, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "3:4": { w: 768, h: 1024 },
  "4:3": { w: 1024, h: 768 },
  "9:16": { w: 576, h: 1024 },
  "16:9": { w: 1024, h: 576 }
};

// 基于 prompt hash 选一个柔和背景色,让 mock 图片有视觉区分度
function bgFromPrompt(prompt: string): string {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) % 360;
  return `hsl(${h}, 35%, 80%)`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makePlaceholderSvg(opts: {
  width: number;
  height: number;
  bg: string;
  title: string;
  lines: string[];
}): string {
  const { width, height, bg, title, lines } = opts;
  const linesXml = lines
    .map(
      (text, i) =>
        `<text x="50%" y="${
          Math.round(height * 0.55) + i * 40
        }" text-anchor="middle" font-size="22" fill="#1A1D24" font-family="PingFang SC, sans-serif">${xmlEscape(
          text
        )}</text>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <text x="50%" y="${Math.round(height * 0.4)}" text-anchor="middle" font-size="48" fill="#1A1D24" font-weight="600" font-family="PingFang SC, sans-serif">${xmlEscape(
    title
  )}</text>
  ${linesXml}
  <text x="50%" y="${
    height - 30
  }" text-anchor="middle" font-size="14" fill="#5C6373" font-family="PingFang SC, sans-serif">EASYROUTER_MODE=mock · 切真实 API 后此占位消失</text>
</svg>`;
}

export async function generateImage(params: GenerateImageParams): Promise<GenerationResult> {
  // 简单延迟 200-800ms 模拟网络
  await new Promise(r => setTimeout(r, 200 + Math.random() * 600));

  const { w, h } = RATIO_TO_DIMENSIONS[params.ratio];
  const svg = makePlaceholderSvg({
    width: w,
    height: h,
    bg: bgFromPrompt(params.prompt),
    title: "Mock Image",
    lines: [
      `model: ${params.model}`,
      `ratio: ${params.ratio} (${w}×${h})`,
      `prompt: ${params.prompt.slice(0, 40)}${params.prompt.length > 40 ? "…" : ""}`
    ]
  });

  return {
    task_id: randomUUID(),
    status: "succeeded",
    image_b64: Buffer.from(svg, "utf-8").toString("base64"),
    image_format: "svg",
    cost_cny: 0.3,
    raw_usage: { mock: true, prompt_length: params.prompt.length }
  };
}

export async function generateVideo(params: GenerateVideoParams): Promise<GenerationResult> {
  // 视频也用 SVG 占位(真实视频接入后再换 mp4 占位)
  await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));

  const { w, h } = RATIO_TO_DIMENSIONS[params.ratio];
  const svg = makePlaceholderSvg({
    width: w,
    height: h,
    bg: bgFromPrompt(params.prompt),
    title: "Mock Video",
    lines: [
      `model: ${params.model}`,
      `ratio: ${params.ratio} (${w}×${h})`,
      `duration: ${params.duration_seconds}s`,
      `prompt: ${params.prompt.slice(0, 40)}${params.prompt.length > 40 ? "…" : ""}`
    ]
  });

  return {
    task_id: randomUUID(),
    status: "succeeded",
    image_b64: Buffer.from(svg, "utf-8").toString("base64"),
    image_format: "svg",
    cost_cny: 1.0,
    raw_usage: { mock: true, duration_seconds: params.duration_seconds }
  };
}

export async function getTaskStatus(taskId: string): Promise<GenerationResult> {
  // mock 模式下生成是同步的,getTaskStatus 不该被调用;返回 not found
  throw new GenerationError(
    "unknown",
    `mock mode does not support getTaskStatus(${taskId}) — generation is synchronous`
  );
}
