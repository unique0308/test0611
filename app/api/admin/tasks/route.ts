import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAllTasksForAdmin, writeAuditLog, type AdminTaskFilters } from "@/lib/db/queries";

// V1.7 GET /api/admin/tasks?type=&status=&department_id=&model_name=&purpose_tag_name=&search=&date_from=&date_to=&page=&page_size=
// audit `admin_query_task`(filter 摘要 + count + page 信息进 metadata)
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const sp = req.nextUrl.searchParams;

  const filters: AdminTaskFilters = {
    type: sp.get("type") === "image" || sp.get("type") === "video" ? (sp.get("type") as "image" | "video") : undefined,
    status: sp.get("status") ?? undefined,
    department_id: sp.get("department_id") ?? undefined,
    user_id: sp.get("user_id") ?? undefined,
    model_name: sp.get("model_name") ?? undefined,
    purpose_tag_name: sp.get("purpose_tag_name") ?? undefined,
    search: sp.get("search") ?? undefined,
    date_from: sp.get("date_from") ?? undefined,
    date_to: sp.get("date_to") ?? undefined,
    page: sp.get("page") ? Number(sp.get("page")) : 1,
    page_size: sp.get("page_size") ? Number(sp.get("page_size")) : 50
  };

  const result = await listAllTasksForAdmin(filters);

  // audit:记 filter 摘要(去掉空值)+ 返回 count;V2 可累计 admin 查询行为分析
  const usedFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  await writeAuditLog({
    user_id: admin.id,
    action: "admin_query_task",
    target_type: "generation_task",
    metadata: {
      filters: usedFilters,
      result_count: result.total,
      page: result.page,
      page_size: result.page_size
    }
  });

  return NextResponse.json(result);
}
