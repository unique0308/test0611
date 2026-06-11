// 生成模块共享类型
// 跨 GenerateCore / GenerationDock / ResultFeedItem / SkeletonResult 等组件复用

export type Kind = "image" | "video";

export const RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
export type Ratio = (typeof RATIOS)[number];

// 视频生成只支持这 3 个比例(2026-05-20:对齐参考产品,视频比例 = 16:9 / 1:1 / 9:16)
export const VIDEO_RATIOS = ["16:9", "1:1", "9:16"] as const;

export type ReferenceImage = {
  dataUrl: string;
  name: string;
  size: number;
};

// 结果 feed 中的一项 — 后端历史 + 本次会话刚生成的都用这个 shape
export type FeedItem = {
  id: string;
  type: Kind;
  status: string;
  prompt: string;
  ratio: string;
  duration_seconds: number | null;
  model_name: string;
  purpose_tag_name: string;
  created_at: string;
  file_url: string | null;
  file_type: string | null;
  // 多张出图(V1.10):有 outputs 时是 N 张,主图仍在 file_url
  outputs?: Array<{ file_url: string; file_type: string; output_index: number }>;
  credits_cost?: number | null;
  // 参考图(图生图 / 图生视频)— 服务 URL,feed 卡片在 prompt 下方展示小预览
  reference_image_url?: string | null;
};

// 提交中/已失败的占位任务 — 跨 GenerateCore 顶层 state + sessionStorage 持久化共用
// errorMessage 非空表示失败,SkeletonResult 会渲染错误态(图片格变红框 + 关闭/重试)
// retry 直接以这个对象为入参重提,不再依赖顶层 state(避免闭包/state 不同步问题)
export type PendingTask = {
  taskId: string | null;
  kind: Kind;
  prompt: string;
  ratio: Ratio;
  duration: 5 | 10;
  outputCount: 1 | 2 | 4;
  modelId: string;
  modelName: string;
  purposeTagId: string;
  purposeTagName: string;
  referenceUrl: string | null;
  // 025 · M5 P1 波 3:选"其他"时的可选短文本(D16 DM5.1,<20 字,仅进 audit_log)
  // 非"其他"时永远空串;失败重试 ctx 保留此值不丢
  otherNote?: string;
  errorMessage?: string;
};

// 用于把 ratio 映射到 Tailwind aspect-ratio 类
export function ratioToAspectClass(ratio: string): string {
  switch (ratio) {
    case "1:1": return "aspect-square";
    case "3:4": return "aspect-[3/4]";
    case "4:3": return "aspect-[4/3]";
    case "9:16": return "aspect-[9/16]";
    case "16:9": return "aspect-video";
    default: return "aspect-square";
  }
}

// ratio 分段控件用的 mini glyph 尺寸(原型 §2.2)
export function ratioGlyphSize(r: Ratio): { width: number; height: number } {
  switch (r) {
    case "1:1": return { width: 11, height: 11 };
    case "3:4": return { width: 9, height: 12 };
    case "4:3": return { width: 12, height: 9 };
    case "9:16": return { width: 7, height: 12 };
    case "16:9": return { width: 12, height: 7 };
  }
}
