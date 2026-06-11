import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { uncollect, patchCollection } from "@/lib/prompts";
import { writeAuditLog } from "@/lib/db/queries";

// DELETE /api/prompts/collect/{id}
// 取消收藏。只能删自己的,跨用户返回 404(不暴露存在性)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();
  const collectionId = Number(params.id);
  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    return new NextResponse("invalid id", { status: 400 });
  }
  const ok = await uncollect({ user_id: user.id, collection_id: collectionId });
  if (!ok) return new NextResponse("not found", { status: 404 });
  await writeAuditLog({
    user_id: user.id,
    action: "prompt_uncollect",
    target_type: "prompt_collection",
    target_id: String(collectionId)
  });
  return NextResponse.json({ id: collectionId, deleted: true });
}

// PATCH /api/prompts/collect/{id}
// body: { title?: string, tags?: string | null }
// 只能改自己的;无 audit_logs(数据本身不敏感,V2 视情况补)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();
  const collectionId = Number(params.id);
  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    return new NextResponse("invalid id", { status: 400 });
  }
  let body: { title?: unknown; tags?: unknown; prompt_text?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }
  const patch: { title?: string; tags?: string | null; prompt_text?: string } = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.length === 0) {
      return new NextResponse("title must be non-empty string", { status: 400 });
    }
    patch.title = body.title.slice(0, 100);
  }
  if (body.tags !== undefined) {
    if (body.tags === null) patch.tags = null;
    else if (typeof body.tags === "string") patch.tags = body.tags.slice(0, 200);
    else return new NextResponse("tags must be string or null", { status: 400 });
  }
  if (body.prompt_text !== undefined) {
    if (typeof body.prompt_text !== "string" || body.prompt_text.trim().length === 0) {
      return new NextResponse("prompt_text must be non-empty string", { status: 400 });
    }
    patch.prompt_text = body.prompt_text.slice(0, 2000);
  }
  const row = await patchCollection({
    user_id: user.id,
    collection_id: collectionId,
    ...patch
  });
  if (!row) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(row);
}
