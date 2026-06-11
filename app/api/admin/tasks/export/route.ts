import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAllTasksForAdmin, writeAuditLog, type AdminTaskFilters } from "@/lib/db/queries";

// V1.7 GET /api/admin/tasks/export(返 CSV)
// audit `admin_query_task` 加 metadata.export='csv';V1 简化:单次最多导出 5000 行(防过大)
const MAX_EXPORT_ROWS = 5000;

const CSV_HEADERS = [
  "任务 ID",
  "申请人",
  "邮箱",
  "部门",
  "类型",
  "状态",
  "模型",
  "使用目的",
  "Prompt",
  "比例",
  "时长(秒)",
  "积分消耗",
  "金额(¥)",
  "创建时间"
];

function csvEscape(s: string | null | undefined): string {
  if (s == null) return "";
  const v = String(s);
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const sp = req.nextUrl.searchParams;

  const filters: AdminTaskFilters = {
    type: sp.get("type") === "image" || sp.get("type") === "video" ? (sp.get("type") as "image" | "video") : undefined,
    status: sp.get("status") ?? undefined,
    department_id: sp.get("department_id") ?? undefined,
    model_name: sp.get("model_name") ?? undefined,
    purpose_tag_name: sp.get("purpose_tag_name") ?? undefined,
    search: sp.get("search") ?? undefined,
    date_from: sp.get("date_from") ?? undefined,
    date_to: sp.get("date_to") ?? undefined,
    page: 1,
    page_size: MAX_EXPORT_ROWS
  };

  const result = await listAllTasksForAdmin(filters);

  // CSV BOM + UTF-8(Excel 中文识别)
  const lines: string[] = [];
  lines.push(CSV_HEADERS.join(","));
  for (const r of result.rows) {
    lines.push([
      csvEscape(r.id),
      csvEscape(r.user_name),
      csvEscape(r.user_email),
      csvEscape(r.department_name ?? ""),
      csvEscape(r.type === "image" ? "图片" : "视频"),
      csvEscape(r.status),
      csvEscape(r.model_name),
      csvEscape(r.purpose_tag_name),
      csvEscape(r.prompt),
      csvEscape(r.ratio),
      csvEscape(r.duration_seconds?.toString() ?? ""),
      csvEscape(r.credits_cost?.toString() ?? ""),
      csvEscape(r.cost_cny?.toString() ?? ""),
      csvEscape(r.created_at)
    ].join(","));
  }
  const csv = "﻿" + lines.join("\n"); // BOM
  const bytes = Buffer.from(csv, "utf-8");

  // audit
  const usedFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  await writeAuditLog({
    user_id: admin.id,
    action: "admin_query_task",
    target_type: "generation_task_export",
    metadata: {
      filters: usedFilters,
      exported_rows: result.rows.length,
      total_rows: result.total,
      export: "csv"
    }
  });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="admin_tasks_${date}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
