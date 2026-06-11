// V1.1 Prompt 收藏模块 - 类型层
// 仅 re-export `@/lib/types/v1` 的相关类型,避免业务代码深 import 内部文件

export type {
  PromptCollection,
  PromptCollectionCreateInput,
  PromptCollectionPatchInput,
  GenerationKind
} from "@/lib/types/v1";

import type { PromptCollection } from "@/lib/types/v1";

// 收藏卡 + 对应生成任务首张产物预览(signed URL);任务被删 / 无产物时为 null
export type PromptCollectionWithPreview = PromptCollection & {
  preview_url: string | null;
};

// 列表筛选:kind 可为 all / image / video;tag 模糊匹配(逗号分隔串)
export type ListCollectionsFilters = {
  user_id: string;
  kind?: "image" | "video";
  tag?: string;
  page?: number;
  page_size?: number;
};

export type ListCollectionsResult = {
  rows: import("@/lib/types/v1").PromptCollection[];
  total: number;
  page: number;
  page_size: number;
};
