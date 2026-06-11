import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

// STORAGE_MODE=local 时的实现
// 文件存到工程根的 ./uploads/ 目录(已在 .gitignore)
// path 规范跟 OSS 保持一致:/generations/{user_id}/{task_id}/result.{ext}
// 切换流程见 ../MVP跟踪文档/后期补全清单.md 第 2 节

const ROOT = join(process.cwd(), "uploads");

function resolvePath(path: string): string {
  // 防越权:必须以 / 开头,且不含 ..
  if (!path.startsWith("/") || path.includes("..")) {
    throw new Error(`invalid storage path: ${path}`);
  }
  return join(ROOT, path);
}

export async function uploadFile(buffer: Buffer, path: string): Promise<{ path: string }> {
  const abs = resolvePath(path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return { path };
}

export async function getSignedUrl(path: string, _expiresInSeconds = 3600): Promise<string> {
  // 本地模式不做签名,直接返回 API 路径
  // 实际访问通过 /api/files/[...path] 路由(读取 uploads/ 下文件)
  if (!path.startsWith("/")) throw new Error(`invalid storage path: ${path}`);
  return `/api/files${path}`;
}

export async function deleteFile(path: string): Promise<void> {
  const abs = resolvePath(path);
  if (existsSync(abs)) await unlink(abs);
}

export async function readLocalFile(path: string): Promise<Buffer> {
  const abs = resolvePath(path);
  return readFile(abs);
}

export async function statLocalFile(path: string): Promise<{ size: number; mtimeMs: number } | null> {
  const abs = resolvePath(path);
  if (!existsSync(abs)) return null;
  const s = await stat(abs);
  return { size: s.size, mtimeMs: s.mtimeMs };
}
