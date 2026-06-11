import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSignedUrl } from "@/lib/storage";
import {
  listTasksByConversation,
  getConversationForUser
} from "@/lib/db/queries";
import { getCollectionMapForTasks } from "@/lib/prompts";

// GET /api/conversations/[id]/tasks
// 列出当前 conversation 下全部 task(含 queued/running,feed 显示 skeleton)
// 按 created_at 升序 — feed 最早在上,最新在下
// 每张 output 转 signed URL + 附 collection_id(⭐ 收藏映射)
//
// 校验 conversation 归属(避免 user_A 拿 user_B 的 conv_id)

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();

  const conv = await getConversationForUser(params.id, user.id);
  if (!conv) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "会话不存在" } }, { status: 404 });
  }

  const tasks = await listTasksByConversation(user.id, params.id);
  const collectionMap = await getCollectionMapForTasks({
    user_id: user.id,
    task_ids: tasks.map(t => t.id)
  });

  const rows = await Promise.all(
    tasks.map(async r => {
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
        file_url: outputs[0]?.file_url ?? null,
        collection_id: coll0?.id ?? null,
        collection_tags: coll0?.tags ?? null
      };
    })
  );

  return NextResponse.json({ conversation: conv, tasks: rows });
}
