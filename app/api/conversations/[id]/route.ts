import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  renameConversation,
  pinConversation,
  softDeleteConversation,
  getConversationForUser,
  setConversationPrimaryTag,
  isActivePurposeTag
} from "@/lib/db/queries";

// PATCH  /api/conversations/[id]
//   body: { name?: string; pinned?: boolean; primary_purpose_tag_id?: string | null }
//   - name/pinned: is_default 拒绝(DEFAULT_LOCKED)
//   - primary_purpose_tag_id: 默认创作也允许改(主标签是 D16 必选机制,所有 conv 都要选)
// DELETE /api/conversations/[id]   软删除(is_default 不可删,API 层 + 数据层都校验)

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();
  const id = params.id;

  // 校验 conversation 归属 + 未软删(is_default 校验下沉到分支)
  const existing = await getConversationForUser(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "会话不存在" } }, { status: 404 });
  }

  let body: { name?: string; pinned?: boolean; primary_purpose_tag_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "BAD_JSON", message: "无效请求体" } }, { status: 400 });
  }

  if (typeof body.name === "string") {
    if (existing.is_default) {
      return NextResponse.json(
        { error: { code: "DEFAULT_LOCKED", message: "默认创作不可修改名字" } },
        { status: 403 }
      );
    }
    const updated = await renameConversation(id, user.id, body.name);
    if (!updated) {
      return NextResponse.json(
        { error: { code: "BAD_NAME", message: "名字不能为空" } },
        { status: 400 }
      );
    }
    return NextResponse.json({ conversation: updated });
  }
  if (typeof body.pinned === "boolean") {
    if (existing.is_default) {
      return NextResponse.json(
        { error: { code: "DEFAULT_LOCKED", message: "默认创作不可置顶" } },
        { status: 403 }
      );
    }
    const updated = await pinConversation(id, user.id, body.pinned);
    if (!updated) {
      return NextResponse.json({ error: { code: "PIN_FAILED", message: "置顶失败" } }, { status: 400 });
    }
    return NextResponse.json({ conversation: updated });
  }
  // 024 · M5 P1 波 2:主标签改造(默认创作也允许改主标签)
  if (body.primary_purpose_tag_id !== undefined) {
    const tagId = body.primary_purpose_tag_id;
    if (tagId !== null) {
      if (typeof tagId !== "string") {
        return NextResponse.json(
          { error: { code: "BAD_TAG", message: "primary_purpose_tag_id 必须是 string 或 null" } },
          { status: 400 }
        );
      }
      const active = await isActivePurposeTag(tagId);
      if (!active) {
        return NextResponse.json(
          { error: { code: "INVALID_TAG", message: "标签不存在或已退役" } },
          { status: 400 }
        );
      }
    }
    const updated = await setConversationPrimaryTag(id, user.id, tagId);
    if (!updated) {
      return NextResponse.json(
        { error: { code: "UPDATE_FAILED", message: "设置主标签失败" } },
        { status: 400 }
      );
    }
    return NextResponse.json({ conversation: updated });
  }

  return NextResponse.json(
    { error: { code: "NO_FIELD", message: "需提供 name / pinned / primary_purpose_tag_id 至少一个" } },
    { status: 400 }
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();
  const existing = await getConversationForUser(params.id, user.id);
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "会话不存在" } }, { status: 404 });
  }
  if (existing.is_default) {
    return NextResponse.json(
      { error: { code: "DEFAULT_LOCKED", message: "默认创作不可删除" } },
      { status: 403 }
    );
  }
  const ok = await softDeleteConversation(params.id, user.id);
  if (!ok) {
    return NextResponse.json({ error: { code: "DELETE_FAILED", message: "删除失败" } }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
