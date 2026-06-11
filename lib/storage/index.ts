// 业务代码 import 的唯一入口
// STORAGE_MODE 切换由本文件决定

import * as local from "./local";
import * as oss from "./oss";

const useOss = process.env.STORAGE_MODE === "oss";
const impl = useOss ? oss : local;

export const uploadFile = impl.uploadFile;
export const getSignedUrl = impl.getSignedUrl;
export const deleteFile = impl.deleteFile;

// 本地模式特有(仅 /api/files/[...path] 路由使用)
export { readLocalFile, statLocalFile } from "./local";

export function isLocalMode(): boolean {
  return !useOss;
}
