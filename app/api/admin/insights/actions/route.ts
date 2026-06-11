import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/db/queries";
import { recordAction, resetAction } from "@/lib/admin/insights";

// POST /api/admin/insights/actions
// Body: { insight_key: string, action_type: "ignored" | "actioned" | "reset", note?: string }
// reset 时不 insert，而是 DELETE 该 key 的全部历史 → 洞察回到 active 状态

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user.is_admin) {
    return NextResponse.json({ error: { code: "forbidden", message: "admin only" } }, { status: 403 });
  }

  let body: { insight_key?: string; action_type?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "invalid_body", message: "not json" } }, { status: 400 });
  }

  if (!body.insight_key || typeof body.insight_key !== "string") {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "insight_key 必填" } },
      { status: 400 }
    );
  }

  if (body.action_type === "reset") {
    await resetAction(body.insight_key);
    await writeAuditLog({
      user_id: user.id,
      action: "admin_insight_reverted",
      target_type: "insight",
      metadata: { insight_key: body.insight_key }
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action_type !== "ignored" && body.action_type !== "actioned") {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "action_type 必须是 ignored / actioned / reset" } },
      { status: 400 }
    );
  }

  await recordAction({
    insight_key: body.insight_key,
    action_type: body.action_type,
    actor_id: user.id,
    note: body.note
  });

  await writeAuditLog({
    user_id: user.id,
    action: `admin_insight_${body.action_type}`,
    target_type: "insight",
    metadata: { insight_key: body.insight_key, note: body.note ?? null }
  });

  return NextResponse.json({ ok: true });
}
