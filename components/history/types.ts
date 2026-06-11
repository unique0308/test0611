import type { HistoryItem } from "@/lib/db/queries";

// 历史记录模块共享类型 + 纯函数(2026-05-21 历史页重塑)

// 单张产物(signed URL 版,/api/tasks 返回);收藏粒度到单张,各产物自带收藏态
export type HistoryOutput = {
  output_index: number;
  file_url: string | null;
  file_type: string;
  width: number | null;
  height: number | null;
  collection_id: number | null; // 该张产物的收藏 id;未收藏为 null
  collection_tags: string | null; // 该张产物收藏的标签(逗号分隔)
};

// HistoryRow = 任务 + 全部产物 + 主图 URL
// collection_id / collection_tags = 「首张产物(output_index 0)」的收藏态
//   —— 给列表视图整行 ⭐ 和无产物占位瓦片用
export type HistoryRow = HistoryItem & {
  file_url: string | null; // 主图(outputs[0])快速路径
  collection_id: number | null;
  collection_tags: string | null;
  outputs: HistoryOutput[];
};

export type HistoryType = "all" | "image" | "video";

export type HistoryDateRange = "7d" | "30d" | "month" | "quarter";

export const DATE_RANGE_LABELS: Record<HistoryDateRange, string> = {
  "7d": "近 7 天",
  "30d": "近 30 天",
  month: "本月",
  quarter: "本季度"
};

// 时间筛选 → date_from(ISO),传给 /api/tasks
export function computeRange(r: HistoryDateRange): { dateFrom: string } {
  const now = new Date();
  if (r === "7d") return { dateFrom: new Date(now.getTime() - 7 * 86400_000).toISOString() };
  if (r === "30d") return { dateFrom: new Date(now.getTime() - 30 * 86400_000).toISOString() };
  if (r === "month") {
    return { dateFrom: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString() };
  }
  // quarter:当前季度首日
  const qStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  return { dateFrom: new Date(Date.UTC(now.getUTCFullYear(), qStartMonth, 1)).toISOString() };
}

// 相对时间(列表 / 详情用)
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// 完整时间(详情弹层用)
export function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    succeeded: "已完成",
    running: "生成中",
    failed: "生成失败",
    cancelled: "已取消",
    pending: "排队中"
  };
  return map[status] ?? status;
}

// "3:4" → "3 / 4"(CSS aspect-ratio);无法解析回退 1
export function ratioToAspect(ratio: string | null): string {
  if (!ratio) return "1 / 1";
  const m = /^\s*(\d+)\s*[:：xX]\s*(\d+)\s*$/.exec(ratio);
  if (!m) return "1 / 1";
  return `${m[1]} / ${m[2]}`;
}

// ─── 日期分组(画廊视图)─────────────────────────────────────────────────────

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 日期分组标题 — 对齐 image#24 用 YYYY.MM.DD
export function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

// 画廊瓦片:每张产物一个瓦片;无产物(失败/进行中)给 1 个占位瓦片
export type GalleryTile = {
  key: string;
  task: HistoryRow;
  output: HistoryOutput | null; // null = 占位(无产物)
};

// 同一日期内按类型分区:图片一组、视频一组
export type GallerySection = { kind: "image" | "video"; tiles: GalleryTile[] };

// mixed = 该日期同时有图片和视频(为 true 才显示「图片」「视频」小标题)
export type GalleryGroup = {
  key: string;
  label: string;
  sections: GallerySection[];
  mixed: boolean;
};

// 把任务行(日期降序)摊平成:按日期分组 → 组内按 图片 / 视频 分区(方案 B)
export function buildGallery(rows: HistoryRow[]): GalleryGroup[] {
  type Bucket = { key: string; label: string; image: GalleryTile[]; video: GalleryTile[] };
  const buckets: Bucket[] = [];
  let cur: Bucket | null = null;

  for (const task of rows) {
    const gkey = dayKey(new Date(task.created_at));
    if (!cur || cur.key !== gkey) {
      cur = { key: gkey, label: dateGroupLabel(task.created_at), image: [], video: [] };
      buckets.push(cur);
    }
    const hasOutputs = task.status === "succeeded" && task.outputs.length > 0;
    const tiles: GalleryTile[] = hasOutputs
      ? task.outputs.map(o => ({ key: `${task.id}:${o.output_index}`, task, output: o }))
      : [{ key: `${task.id}:placeholder`, task, output: null }];
    (task.type === "video" ? cur.video : cur.image).push(...tiles);
  }

  return buckets.map(b => {
    const sections: GallerySection[] = [];
    if (b.image.length > 0) sections.push({ kind: "image", tiles: b.image });
    if (b.video.length > 0) sections.push({ kind: "video", tiles: b.video });
    return { key: b.key, label: b.label, sections, mixed: sections.length > 1 };
  });
}

// 把任务关键参数序列化到 query string,生成页解析后 prefill 表单(沿用历史页旧实现)
export function encodePrefill(r: HistoryItem): string {
  const payload = {
    type: r.type,
    prompt: r.prompt,
    ratio: r.ratio,
    model_name: r.model_name,
    purpose_tag_name: r.purpose_tag_name,
    duration_seconds: r.duration_seconds
  };
  return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
}
