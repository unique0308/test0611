import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  mergePurposeTags,
  TagNotFoundError,
  TagAlreadyMergedError,
  CannotMergeIntoSelfError,
  CannotMergeBuiltinTagError,
  writeAuditLog
} from "@/lib/db/queries";

// V1.12 PATCH /api/admin/purpose-tags/merge
// body: { source_id: string, target_id: string }
// 把 source 合并到 target;source 在 active 列表消失;历史 purpose_tag_name 快照保留
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  let body: { source_id?: unknown; target_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }
  const sourceId = typeof body.source_id === "string" ? body.source_id : "";
  const targetId = typeof body.target_id === "string" ? body.target_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(sourceId) || !/^[0-9a-f-]{36}$/i.test(targetId)) {
    return new NextResponse("invalid source_id / target_id", { status: 400 });
  }

  let result;
  try {
    result = await mergePurposeTags({ source_id: sourceId, target_id: targetId });
  } catch (e: unknown) {
    if (e instanceof TagNotFoundError) return new NextResponse("not found", { status: 404 });
    if (e instanceof TagAlreadyMergedError) {
      return NextResponse.json({ error: "already_merged", message: "标签已被合并" }, { status: 409 });
    }
    if (e instanceof CannotMergeIntoSelfError) {
      return NextResponse.json({ error: "self_merge", message: "不能合并到自己" }, { status: 422 });
    }
    if (e instanceof CannotMergeBuiltinTagError) {
      return NextResponse.json({ error: "builtin_source", message: "不能合并默认标签" }, { status: 422 });
    }
    throw e;
  }

  await writeAuditLog({
    user_id: admin.id,
    action: "admin_merge_purpose_tags",
    target_type: "purpose_tag",
    target_id: sourceId,
    metadata: {
      source_name: result.source_name,
      target_id: targetId,
      target_name: result.target_name,
      affected_tasks: result.affected_tasks
    }
  });

  return NextResponse.json(result);
}
