import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  createUserPurposeTag,
  DuplicateTagError,
  writeAuditLog
} from "@/lib/db/queries";

// V1.12 POST /api/purpose-tags
// 员工新增使用目的(Q-V1-10:不审核直接生效)
export async function POST(req: NextRequest) {
  const user = await requireAuth();
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  const name = body.name.trim();
  if (name.length > 32) {
    return NextResponse.json({ error: "name_too_long", message: "名称需 ≤ 32 字符" }, { status: 422 });
  }

  let row;
  try {
    row = await createUserPurposeTag({ name, user_id: user.id });
  } catch (e: unknown) {
    if (e instanceof DuplicateTagError) {
      return NextResponse.json(
        { error: "duplicate", message: `标签 "${e.existingName}" 已存在`, existing_name: e.existingName },
        { status: 409 }
      );
    }
    throw e;
  }

  await writeAuditLog({
    user_id: user.id,
    action: "purpose_tag_create",
    target_type: "purpose_tag",
    target_id: row.id,
    metadata: { name: row.name }
  });

  return NextResponse.json(row);
}
