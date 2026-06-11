// 模型对长宽比的支持等级 — 给前端模型选择卡片标注用,让用户事先知情
//
// 信息来源(隐含在 provider 代码里,这里 derive 出来):
//   - video 模型: 所有 provider 都走 body.aspect_ratio,真严格 → "strict"
//   - image OpenAI Images API 系(gpt-image-*, dall-e-*): body.size 但仅 1024x1024 / 1024x1536 / 1536x1024
//       9:16 被压成 1024x1536(=3:4),16:9 被压成 1536x1024(=4:3) → "limited"
//   - image AIHubMix: 也走 /images/generations,同样 3 档限制 → "limited"
//   - image 其他(Gemini 2.5 Flash Image 等走 chat completions): ratio 只是 prompt hint,
//       靠模型自觉,常出近 1:1 → "hint"

export type RatioSupport = "strict" | "limited" | "hint";

type RatioSupportInput = {
  type: "image" | "video" | string;
  provider: string;
  easyrouter_model_key: string;
};

export function getRatioSupport(model: RatioSupportInput): RatioSupport {
  if (model.type === "video") return "strict";
  const key = (model.easyrouter_model_key ?? "").toLowerCase();
  if (key.startsWith("gpt-image-") || key.startsWith("dall-e-")) return "limited";
  if (model.provider === "aihubmix") return "limited";
  return "hint";
}

// chip 文案 + 提示 — 给前端展示用
export const RATIO_SUPPORT_LABEL: Record<RatioSupport, { short: string; tooltip: string }> = {
  strict: {
    short: "严格比例",
    tooltip: "选什么比例就出什么比例"
  },
  limited: {
    short: "仅 3 档",
    tooltip: "模型本身仅支持 1:1 / 3:4 / 4:3,你选 9:16 实际出 3:4,选 16:9 实际出 4:3"
  },
  hint: {
    short: "比例近似",
    tooltip: "通过 prompt 提示模型,实际出图可能偏向 1:1,不严格按所选比例"
  }
};

// limited 模型下,9:16 实际等于 3:4,16:9 实际等于 4:3 (OpenAI Images API 上限)
// 选了 limited 模型时:UI 直接隐藏 9:16/16:9 选项,如果 state 留着这俩值就用这个函数映射回来
export function effectiveRatio(
  model: RatioSupportInput | null | undefined,
  ratio: string
): string {
  if (!model) return ratio;
  if (getRatioSupport(model) !== "limited") return ratio;
  if (ratio === "9:16") return "3:4";
  if (ratio === "16:9") return "4:3";
  return ratio;
}

// limited 模型实际可选的比例集合(给比例选择器过滤选项用)
export const LIMITED_RATIOS = ["1:1", "3:4", "4:3"] as const;
