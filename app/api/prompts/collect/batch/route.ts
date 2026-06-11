import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { collectFromTasksBatch } from "@/lib/prompts";
import { writeAuditLog } from "@/lib/db/queries";

// POST /api/prompts/collect/batch  body: { items: [{ task_id, output_index }] }
// 资产页批量收藏:逐项收藏(幂等);单次 ≤ 100,命中 200 条上限会提前停止
const MAX_BATCH = 100;

type RawItem = { task_id?: unknown; output_index?: unknown };

export async function POST(req: NextRequest) {
  const user = await requireAuth();

  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const items: Array<{ task_id: string; output_index: number }> = [];
  if (Array.isArray(body.items)) {
    for (const raw of body.items as RawItem[]) {
      if (raw && typeof raw.task_id === "string" && /^[0-9a-f-]{36}$/i.test(raw.task_id)) {
        const oi =
          typeof raw.output_index === "number" && Number.isInteger(raw.output_index) && raw.output_index >= 0
            ? raw.output_index
            : 0;
        items.push({ task_id: raw.task_id, output_index: oi });
      }
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "no_items", message: "请选择至少 1 项" }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return NextResponse.json(
      { error: "too_many", message: `单次最多收藏 ${MAX_BATCH} 项` },
      { status: 422 }
    );
  }

  const { collected, limitReached } = await collectFromTasksBatch({ user_id: user.id, items });

  await writeAuditLog({
    user_id: user.id,
    action: "prompt_collect_batch",
    target_type: "prompt_collection_batch",
    metadata: { requested: items.length, collected }
  });

  return NextResponse.json({ collected, limitReached });
}
