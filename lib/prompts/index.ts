// V1.1 Prompt 收藏模块 - 业务代码唯一入口
//
// CLAUDE.md 第 4.1 节铁律:业务代码绝不直接 import ./queries 或 ./types
// 后续如需切到 RPC / 其他实现,只动本目录内部文件,业务代码透明无感

export {
  collectFromTask,
  collectFromTasksBatch,
  uncollect,
  listUserCollections,
  getUserCollection,
  patchCollection,
  getCollectionMapForTasks,
  getUserCollectionTags,
  PromptCollectionLimitReachedError,
  TaskNotFoundError
} from "./queries";

export type {
  PromptCollection,
  PromptCollectionWithPreview,
  PromptCollectionCreateInput,
  PromptCollectionPatchInput,
  ListCollectionsFilters,
  ListCollectionsResult,
  GenerationKind
} from "./types";
