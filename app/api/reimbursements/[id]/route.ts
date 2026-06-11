import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getRequest } from "@/lib/reimbursements";
import { getSignedUrl } from "@/lib/storage";

// GET /api/reimbursements/{id}
// 员工只能看自己 / admin 看全部;跨用户访问返 404 不暴露存在性
// attachment_urls 转 signed URL 返回(避免前端拼接路径)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return new NextResponse("invalid id", { status: 400 });
  }

  const row = await getRequest({ id, user_id: user.id, is_admin: user.is_admin });
  if (!row) return new NextResponse("not found", { status: 404 });

  const signed = await Promise.all(row.attachment_urls.map(p => getSignedUrl(p)));

  return NextResponse.json({ ...row, attachment_signed_urls: signed });
}
