import {
  GenerationError,
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerationResult
} from "../index";

// 火山方舟(Volcengine Ark)provider 骨架
// 用于接 Seedream(图片)/ Seedance(视频)等字节官方模型
// 文档:https://www.volcengine.com/docs/82379
//
// 切换触发条件:嘉斌补 VOLCENGINE_API_KEY + 模型 endpoint id;Day 3 暂未启用
//
// 关键差异(待实测确认):
//   - 鉴权:Bearer + 可能需要签名;走 https://ark.cn-beijing.volces.com/api/v3
//   - 视频生成:异步,返回 task_id → 轮询 /contents/generations/tasks/{id}
//   - 模型 ID 是火山 endpoint_id(形如 ep-2026xxxxxx-xxxxx),不是模型名
//   - cost 字段:可能在 usage.total_price 或不返回(需查文档)

const TODO = "TODO: volcengine provider not implemented (awaiting key + endpoint id, see LOCAL_SECRETS.md §2)";

export async function generateImage(_params: GenerateImageParams): Promise<GenerationResult> {
  throw new GenerationError("model_unavailable", TODO);
}

export async function generateVideo(_params: GenerateVideoParams): Promise<GenerationResult> {
  throw new GenerationError("model_unavailable", TODO);
}

export async function getTaskStatus(_taskId: string): Promise<GenerationResult> {
  throw new GenerationError("unknown", TODO);
}
