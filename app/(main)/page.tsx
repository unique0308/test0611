import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { GenerateCore } from "@/components/generate/GenerateCore";
import { ConversationHeader } from "@/components/conversations/ConversationHeader";
import { type FeedItem } from "@/components/generate/types";
import {
  listEnabledModels,
  listActivePurposeTags,
  getDefaultPurposeTag,
  getDepartmentQuotaSnapshot,
  ensureDefaultConversation,
  getConversationForUser,
  listTasksByConversation,
  listUserConversations
} from "@/lib/db/queries";
import { getCollectionMapForTasks } from "@/lib/prompts";
import { getSignedUrl } from "@/lib/storage";

// 生成核心 — 2026-05-29 V1 加 B(设计参考 §3.1 + §4.1.1):
// 1. SSR 接 ?conversation_id query;无效/缺失 → ensureDefaultConversation 兜底
// 2. 拉该 conv 下全部 task 转 FeedItem 传 initialFeedItems
// 3. <GenerateCore key={convId}> 切 conv 时强制 unmount/remount,state 重置
// 4. /?kind=image|video 切换驱动 dock 内部 image/video 切换(query 用)
// 5. "清空页面" 改为创建新对话 + push 路由(语义跟 ConversationsPanel 的 +新对话 一致)

export const dynamic = "force-dynamic";

export default async function GeneratePage({
  searchParams
}: {
  searchParams: { conversation_id?: string; kind?: string };
}) {
  const user = await requireAuth();

  // Resolve conversation_id
  // 2026-05-29 V1 加 B 修订:无 conv_id 时跳到**最新一条 conv**(用户的"最近对话栏"),
  // 不再默认 ensureDefault。点 sidebar "图片生成"/"视频生成" 时也走这里 → 跳到最新 conv
  let convId: string;
  let primaryPurposeTagId: string | null = null;
  if (searchParams.conversation_id) {
    const conv = await getConversationForUser(searchParams.conversation_id, user.id);
    if (conv) {
      convId = conv.id;
      primaryPurposeTagId = conv.primary_purpose_tag_id;
    } else {
      const fallback = await ensureDefaultConversation(user.id);
      convId = fallback.id;
      primaryPurposeTagId = fallback.primary_purpose_tag_id;
    }
  } else {
    const convs = await listUserConversations(user.id);
    const latest = convs[0]; // listUserConversations 已按 pinned + updated_at 倒序
    const targetId = latest ? latest.id : (await ensureDefaultConversation(user.id)).id;
    const kind = searchParams.kind === "video" ? "video" : "image";
    redirect(`/?conversation_id=${targetId}&kind=${kind}`);
  }

  const [imageModels, videoModels, purposeTags, defaultTag, quota, tasks] = await Promise.all([
    listEnabledModels("image"),
    listEnabledModels("video"),
    listActivePurposeTags(),
    getDefaultPurposeTag(),
    user.department_id
      ? getDepartmentQuotaSnapshot(user.department_id)
      : Promise.resolve({
          used_credits: 0,
          limit_credits: 5000,
          ratio: 0,
          warning: "green" as const
        }),
    listTasksByConversation(user.id, convId)
  ]);

  // 收藏映射(任务级 collection_id,⭐ 收藏 prompt 用)
  const collectionMap = await getCollectionMapForTasks({
    user_id: user.id,
    task_ids: tasks.map(t => t.id)
  });

  // 转 FeedItem(每张 output 转 signed URL;参考图也转 signed URL)
  const feedItems: FeedItem[] = await Promise.all(
    tasks.map(async t => {
      const outputs = await Promise.all(
        t.outputs.map(async o => ({
          file_url: await getSignedUrl(o.file_path),
          file_type: o.file_type,
          output_index: o.output_index
        }))
      );
      const referenceSigned = t.reference_image_url
        ? await getSignedUrl(t.reference_image_url).catch(() => null)
        : null;
      return {
        id: t.id,
        type: t.type,
        status: t.status,
        prompt: t.prompt,
        ratio: t.ratio,
        duration_seconds: t.duration_seconds,
        model_name: t.model_name,
        purpose_tag_name: t.purpose_tag_name,
        created_at: t.created_at,
        file_url: outputs[0]?.file_url ?? null,
        file_type: outputs[0]?.file_type ?? null,
        outputs,
        credits_cost: t.credits_cost,
        reference_image_url: referenceSigned
      };
    })
  );

  // collectionMap → Record<task_id, collection_id>(只取主图 output_index=0)
  const collectionMapForCore: Record<string, number> = {};
  for (const t of tasks) {
    const c = collectionMap.get(`${t.id}:0`);
    if (c) collectionMapForCore[t.id] = c.id;
  }

  // 025 · M5 P1 波 3:从 active purpose_tags 找"其他"id(name_normalized='other_v2')
  // 用于 Dock 判断是否要显示 optional <20 字 input(D16 DM5.1)
  const otherTag = purposeTags.find(t => t.name_normalized === "other_v2");
  const otherPurposeTagId = otherTag?.id ?? null;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] min-h-0">
      {/* M5 P1 波 2:会话头部主标签 chip(D16 DM5.9)*/}
      <div className="px-6 py-2 flex items-center gap-3 border-b border-border shrink-0">
        <ConversationHeader
          conversationId={convId}
          primaryPurposeTagId={primaryPurposeTagId}
          purposeTags={purposeTags}
        />
      </div>
      <div className="flex-1 min-h-0">
        <GenerateCore
          key={convId}
          conversationId={convId}
          primaryPurposeTagId={primaryPurposeTagId}
          otherPurposeTagId={otherPurposeTagId}
          imageModels={imageModels}
          videoModels={videoModels}
          purposeTags={purposeTags}
          defaultPurposeTagId={defaultTag?.id ?? purposeTags[0]?.id ?? ""}
          initialUsedCredits={quota.used_credits}
          initialLimitCredits={quota.limit_credits}
          initialFeedItems={feedItems}
          initialCollectionMap={collectionMapForCore}
          userId={user.id}
        />
      </div>
    </div>
  );
}
