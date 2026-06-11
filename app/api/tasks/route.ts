import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listUserTasks } from "@/lib/db/queries";
import { getCollectionMapForTasks } from "@/lib/prompts";

// GET /api/tasks?type=image|video&date_from=&date_to=&model=&purpose=&q=&page=&page_size=
// 只列当前登录用户的 generation_tasks(技术 5.4 兜底 WHERE user_id=current)
// V1.1 Day 23 起每行附 collection_id(null 表示未收藏),让历史页 ⭐ 按钮有真值
// 2026-05-21 历史页重塑:加 model / purpose / q 三个筛选参数(均走 listUserTasks 服务端过滤)

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  const sp = req.nextUrl.searchParams;

  const type = sp.get("type");
  const dateFrom = sp.get("date_from");
  const dateTo = sp.get("date_to");
  const model = sp.get("model");
  const purpose = sp.get("purpose");
  const q = sp.get("q");
  const collected = sp.get("collected") === "true";
  const page = sp.get("page");
  const pageSize = sp.get("page_size");

  const result = await listUserTasks({
    user_id: user.id,
    type: type === "image" || type === "video" ? type : undefined,
    date_from: dateFrom ?? undefined,
    date_to: dateTo ?? undefined,
    model_name: model?.trim() || undefined,
    purpose_tag_name: purpose?.trim() || undefined,
    q: q?.trim() || undefined,
    collected: collected || undefined,
    page: page ? Number(page) : 1,
    page_size: pageSize ? Number(pageSize) : 20
  });

  // 把 file_path 转成 storage signed URL(每张 output 都转),同时查批量 collection_id 映射
  const { getSignedUrl } = await import("@/lib/storage");
  const collectionMap = await getCollectionMapForTasks({
    user_id: user.id,
    task_ids: result.rows.map(r => r.id)
  });
  const rows = await Promise.all(
    result.rows.map(async r => {
      const outputs = await Promise.all(
        r.outputs.map(async o => {
          const c = collectionMap.get(`${r.id}:${o.output_index}`);
          return {
            output_index: o.output_index,
            file_url: await getSignedUrl(o.file_path),
            file_type: o.file_type,
            width: o.width,
            height: o.height,
            collection_id: c?.id ?? null,
            collection_tags: c?.tags ?? null
          };
        })
      );
      const coll0 = collectionMap.get(`${r.id}:0`);
      return {
        ...r,
        outputs,
        file_url: outputs[0]?.file_url ?? null, // 主图快速路径(列表缩略图 / 向后兼容)
        collection_id: coll0?.id ?? null,
        collection_tags: coll0?.tags ?? null
      };
    })
  );

  return NextResponse.json({ ...result, rows });
}
