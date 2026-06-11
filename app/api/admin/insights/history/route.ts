import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getActionHistory } from "@/lib/admin/insights";

// GET /api/admin/insights/history?insight_key=<key>
// 返回该洞察的操作历史（最近 5 条 actions）

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user.is_admin) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "admin only" } },
      { status: 403 }
    );
  }
  const sp = req.nextUrl.searchParams;
  const key = sp.get("insight_key");
  if (!key) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "insight_key 必填" } },
      { status: 400 }
    );
  }
  const rows = await getActionHistory(key, 5);
  return NextResponse.json({ rows });
}
