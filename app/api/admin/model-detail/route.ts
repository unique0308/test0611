import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getModelMonthlyTrend,
  getModelByDept,
  getModelByPurpose,
  getModelPeerCompare
} from "@/lib/db/queries";

// GET /api/admin/model-detail?model=<name>&month=YYYY-MM
// month 省略时默认本月。返回：
//   - monthly 近 6 月柱图数据（不随 month 变化，永远 6 月历史）
//   - byDept / byPurpose / peers 按指定 month 聚合

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user.is_admin) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "admin only" } },
      { status: 403 }
    );
  }
  const sp = req.nextUrl.searchParams;
  const modelName = sp.get("model");
  if (!modelName) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "model 必填" } },
      { status: 400 }
    );
  }
  const monthParam = sp.get("month") ?? undefined;
  // 月份格式校验：YYYY-MM
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : undefined;

  const [monthly, byDept, byPurpose, peerResult] = await Promise.all([
    getModelMonthlyTrend(modelName, 6),
    getModelByDept(modelName, month),
    getModelByPurpose(modelName, month),
    getModelPeerCompare(modelName, month)
  ]);

  return NextResponse.json({
    monthly,
    byDept,
    byPurpose,
    self_type: peerResult.self_type,
    peers: peerResult.peers
  });
}
