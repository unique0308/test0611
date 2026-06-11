// STORAGE_MODE=oss 时的实现骨架
// MVP 阶段函数体 throw,切换流程见 ../MVP跟踪文档/后期补全清单.md 第 2 节
// 真实接入触发:阿里云 RAM 子账号 + bucket 就位(IT)

const TODO = "TODO: integrate when aliyun OSS ready (见 LOCAL_SECRETS.md 第 4 节)";

export async function uploadFile(_buffer: Buffer, _path: string): Promise<{ path: string }> {
  throw new Error(TODO);
}

export async function getSignedUrl(_path: string, _expiresInSeconds = 3600): Promise<string> {
  throw new Error(TODO);
}

export async function deleteFile(_path: string): Promise<void> {
  throw new Error(TODO);
}
