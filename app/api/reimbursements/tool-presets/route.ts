import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listEnabledToolPresets } from "@/lib/reimbursements";

// GET /api/reimbursements/tool-presets
// 申请表单的预设工具下拉数据源(seed 7 项,见 008_v1_seed.sql)
// 需要登录,但不区分角色
export async function GET() {
  await requireAuth();
  const presets = await listEnabledToolPresets();
  return NextResponse.json({ rows: presets });
}
