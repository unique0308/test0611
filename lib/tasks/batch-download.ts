// V1.15 历史页批量下载 - 流式 zip 生成(D9 决定加,P1)
// 设计依据:技术跟踪 §7 Week 4 任务 4.8
//
// 简化策略:in-memory 收集 archiver 输出 chunks,然后返回 Buffer
//   - V1 阶段单次 ≤ 100 条任务,平均 1-3 MB,总计 ≤ 数百 MB 可控
//   - 切真实 OSS 后改成 stream pipe 给 Web Response.body(V1.15 末或 V2 升级)

import archiver from "archiver";
import { readLocalFile } from "@/lib/storage";

export const MAX_TASKS_PER_ZIP = 100;

export class TooManyTasksError extends Error {
  constructor(public count: number) {
    super(`zip 批量下载最多 ${MAX_TASKS_PER_ZIP} 条,本次 ${count} 条`);
    this.name = "TooManyTasksError";
  }
}

export type ZipTaskInput = {
  task_id: string;
  kind: "image" | "video";
  file_path: string;
  file_type: string;
};

export type ZipResult = {
  buffer: Buffer;
  total_bytes: number;
  filename: string;
};

// 按生成顺序输出:001_image_<taskid8>.png / 002_video_<taskid8>.mp4
function entryNameFor(idx: number, t: ZipTaskInput): string {
  const padded = String(idx + 1).padStart(3, "0");
  const idShort = t.task_id.slice(0, 8);
  const ext = guessExt(t.file_type);
  return `${padded}_${t.kind}_${idShort}.${ext}`;
}

function guessExt(mime: string): string {
  if (mime.startsWith("image/")) return mime.slice("image/".length).replace("jpeg", "jpg");
  if (mime.startsWith("video/")) return mime.slice("video/".length);
  return "bin";
}

// zip 文件名:{用户名}_{YYYY-MM-DD}_{count}items.zip
export function buildZipFilename(userName: string, count: number): string {
  const date = new Date().toISOString().slice(0, 10);
  const safe = userName.replace(/[\\/:*?"<>|]/g, "_");
  return `${safe}_${date}_${count}items.zip`;
}

// 构建 zip Buffer(in-memory,简化版)
// 跑前提:tasks 数量 ≤ MAX_TASKS_PER_ZIP,所有 file_path 可从 lib/storage 本地读取
// V2 切 OSS 时:改成接 Web ReadableStream + signed URL fetch
export async function buildBatchZip(args: {
  userName: string;
  tasks: ZipTaskInput[];
}): Promise<ZipResult> {
  if (args.tasks.length > MAX_TASKS_PER_ZIP) {
    throw new TooManyTasksError(args.tasks.length);
  }

  const archive = archiver("zip", { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  return new Promise<ZipResult>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("warning", err => {
      if ((err as { code?: string }).code === "ENOENT") {
        // 单个文件丢失只警告,跳过(V1 阶段不应发生,但兜底)
        // eslint-disable-next-line no-console
        console.warn("[batch-zip] warning:", err.message);
      } else {
        reject(err);
      }
    });
    archive.on("error", reject);
    archive.on("end", () => {
      const buf = Buffer.concat(chunks);
      resolve({
        buffer: buf,
        total_bytes: buf.length,
        filename: buildZipFilename(args.userName, args.tasks.length)
      });
    });

    // 同步逐文件 append(archiver 内部按队列处理)
    (async () => {
      try {
        for (let i = 0; i < args.tasks.length; i++) {
          const t = args.tasks[i];
          const fileBuf = await readLocalFile(t.file_path);
          archive.append(fileBuf, { name: entryNameFor(i, t) });
        }
        await archive.finalize();
      } catch (err) {
        reject(err);
      }
    })();
  });
}
