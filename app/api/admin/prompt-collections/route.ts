import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  listAllCollectionsForAdmin,
  writeAuditLog,
  type AdminCollectionFilters
} from "@/lib/db/queries";

// V1.8 GET /api/admin/prompt-collections
// 全员 Prompt 收藏聚合 + 筛选 + 分页 + 头部 stats(总数/图片/视频/热门模型/热门用户)
// audit `admin_view_collections`
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const sp = req.nextUrl.searchParams;

  const filters: AdminCollectionFilters = {
    kind: sp.get("kind") === "image" || sp.get("kind") === "video" ? (sp.get("kind") as "image" | "video") : undefined,
    department_id: sp.get("department_id") ?? undefined,
    user_id: sp.get("user_id") ?? undefined,
    search: sp.get("search") ?? undefined,
    date_from: sp.get("date_from") ?? undefined,
    date_to: sp.get("date_to") ?? undefined,
    page: sp.get("page") ? Number(sp.get("page")) : 1,
    page_size: sp.get("page_size") ? Number(sp.get("page_size")) : 24
  };

  const result = await listAllCollectionsForAdmin(filters);

  const usedFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  await writeAuditLog({
    user_id: admin.id,
    action: "admin_view_collections",
    target_type: "prompt_collection",
    metadata: {
      filters: usedFilters,
      result_count: result.total,
      page: result.page,
      page_size: result.page_size
    }
  });

  return NextResponse.json(result);
}
