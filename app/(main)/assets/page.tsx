import { requireAuth } from "@/lib/auth";
import { HistoryView } from "@/components/history/HistoryView";
import { listUserTasks, getUserTaskFilterOptions } from "@/lib/db/queries";
import { getCollectionMapForTasks, getUserCollectionTags } from "@/lib/prompts";
import { getSignedUrl } from "@/lib/storage";
import type { HistoryRow } from "@/components/history/types";

// 资产 — 侧边栏顶级页(2026-05-22:历史记录 + Prompt 收藏 合并为「资产」)
// SSR 一次性 fetch:首页 24 条 + 统计条 + 筛选下拉数据源;后续筛选/翻页走 /api/tasks

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function AssetsPage() {
  const user = await requireAuth();

  // 首屏默认「图片」tab,SSR 与默认筛选对齐
  const [history, filterOptions, userTags] = await Promise.all([
    listUserTasks({ user_id: user.id, type: "image", page: 1, page_size: PAGE_SIZE }),
    getUserTaskFilterOptions(user.id),
    getUserCollectionTags(user.id)
  ]);

  // 历史行 → 每张 output 转 signed URL + collection_id
  const collMap = await getCollectionMapForTasks({
    user_id: user.id,
    task_ids: history.rows.map(r => r.id)
  });
  const rows: HistoryRow[] = await Promise.all(
    history.rows.map(async r => {
      const outputs = await Promise.all(
        r.outputs.map(async o => {
          const c = collMap.get(`${r.id}:${o.output_index}`);
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
      const coll0 = collMap.get(`${r.id}:0`);
      return {
        ...r,
        outputs,
        file_url: outputs[0]?.file_url ?? null,
        collection_id: coll0?.id ?? null,
        collection_tags: coll0?.tags ?? null
      };
    })
  );

  return (
    <div className="page">
      <div className="crumb">
        <span>工作台</span>
        <span className="sep">/</span>
        <span style={{ color: "var(--text-2)" }}>资产</span>
      </div>
      <div className="page-head">
        <div>
          <div className="page-title">资产</div>
          <div className="page-subtitle">生成历史与收藏 · 全部时间</div>
        </div>
      </div>
      <HistoryView
        initialRows={rows}
        initialTotal={history.total}
        models={filterOptions.models}
        purposes={filterOptions.purposes}
        userTags={userTags}
      />
    </div>
  );
}
