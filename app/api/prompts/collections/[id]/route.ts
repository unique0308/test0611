import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserCollection } from "@/lib/prompts";
import { writeAuditLog } from "@/lib/db/queries";

// GET /api/prompts/collections/{id}
// 单条详情。前端"使用此 Prompt"点击时调,服务端写 audit_logs.prompt_reuse 再返回
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();
  const collectionId = Number(params.id);
  if (!Number.isFinite(collectionId) || collectionId <= 0) {
    return new NextResponse("invalid id", { status: 400 });
  }
  const row = await getUserCollection({ user_id: user.id, collection_id: collectionId });
  if (!row) return new NextResponse("not found", { status: 404 });

  // 取详情视为"准备复用",写 audit(本接口主要用途就是复用 prefill)
  await writeAuditLog({
    user_id: user.id,
    action: "prompt_reuse",
    target_type: "prompt_collection",
    target_id: String(collectionId),
    metadata: { kind: row.kind, model_name: row.model_name }
  });

  return NextResponse.json(row);
}
