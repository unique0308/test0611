import { requireAuth } from "@/lib/auth";
import { getSignedUrl } from "@/lib/storage";
import {
  listUserConversations,
  getConversationCoverPaths,
  ensureDefaultConversation
} from "@/lib/db/queries";
import { Sidebar } from "@/components/ui/Sidebar";
import { TweaksPanel } from "@/components/ui/TweaksPanel";
import { MainShell } from "@/components/ui/MainShell";
import {
  ConversationsPanel,
  type ConvPanelItem
} from "@/components/conversations/ConversationsPanel";

// (main) 路由组的共享布局
// 2026-05-29 V1 加 B(设计参考 §3.1):MainShell 改 3 列,新增 ConversationsPanel(对话历史栏)
// SSR 预 fetch 当前 user 的全部 conversations(置顶+最近排序)+ 每条 cover signed URL
// 进生成页无 ?conversation_id query 时由 GenerateCore 兜底默认创作(此处也确保 user 至少有默认创作)

export default async function MainLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  let avatarSrc: string | null = null;
  if (user.avatar_url) {
    avatarSrc = /^https?:\/\//.test(user.avatar_url)
      ? user.avatar_url
      : await getSignedUrl(user.avatar_url).catch(() => null);
  }

  // V1 加 B:确保 user 有默认创作(首次访问 user 走这条兜底创建)
  await ensureDefaultConversation(user.id).catch(() => null);

  // 拉 conversations + cover signed URLs(N+1 已优化为 2 query)
  const convs = await listUserConversations(user.id).catch(() => []);
  const coverPaths =
    convs.length > 0
      ? await getConversationCoverPaths(user.id, convs.map((c) => c.id)).catch(() => new Map<string, string>())
      : new Map<string, string>();
  const conversations: ConvPanelItem[] = await Promise.all(
    convs.map(async (c) => {
      const path = coverPaths.get(c.id);
      const cover_url = path ? await getSignedUrl(path).catch(() => null) : null;
      return {
        id: c.id,
        name: c.name,
        is_default: c.is_default,
        pinned_at: c.pinned_at,
        created_at: c.created_at,
        updated_at: c.updated_at,
        cover_url
      };
    })
  );

  return (
    <MainShell
      sidebar={<Sidebar user={user} avatarSrc={avatarSrc} />}
      convPanel={<ConversationsPanel initialConversations={conversations} />}
    >
      {children}
      <TweaksPanel />
    </MainShell>
  );
}
