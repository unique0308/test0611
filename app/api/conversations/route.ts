import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSignedUrl } from "@/lib/storage";
import {
  listUserConversations,
  createConversation,
  getConversationCoverPaths
} from "@/lib/db/queries";

// V1 加 B 完整版会话化(2026-05-29 设计参考 §3.1 + §4.1.1)
// GET  /api/conversations    列出当前 user 的全部 conversations(置顶在前 + 最近排序)+ 每条 cover signed URL
// POST /api/conversations    新建空 conversation(name='' 等首次 task 自动回填)

export async function GET() {
  const user = await requireAuth();
  const convs = await listUserConversations(user.id);
  if (convs.length === 0) {
    return NextResponse.json({ conversations: [] });
  }
  // 取 cover 路径 → 转 signed URL
  const coverPaths = await getConversationCoverPaths(user.id, convs.map(c => c.id));
  const enriched = await Promise.all(
    convs.map(async c => {
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
  return NextResponse.json({ conversations: enriched });
}

export async function POST() {
  const user = await requireAuth();
  // V1 用户点 "+ 新对话" 创建空会话,name='' 等首次 task 完成后自动回填前 18 字
  // 不接受客户端传 name(避免命名冲突 / 长度校验);如需手动命名走 PATCH 重命名
  const conv = await createConversation(user.id, "");
  return NextResponse.json({ conversation: conv }, { status: 201 });
}
