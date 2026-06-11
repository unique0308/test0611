import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listUserCollections } from "@/lib/prompts";

// GET /api/prompts/collections?kind=image|video&tag=&page=&page_size=
// 我的收藏列表(只列自己的,SQL 层 user_id 兜底)
export async function GET(req: NextRequest) {
  const user = await requireAuth();
  const sp = req.nextUrl.searchParams;

  const kindRaw = sp.get("kind");
  const tag = sp.get("tag") ?? undefined;
  const page = sp.get("page");
  const pageSize = sp.get("page_size");

  const result = await listUserCollections({
    user_id: user.id,
    kind: kindRaw === "image" || kindRaw === "video" ? kindRaw : undefined,
    tag,
    page: page ? Number(page) : 1,
    page_size: pageSize ? Number(pageSize) : 20
  });

  return NextResponse.json(result);
}
