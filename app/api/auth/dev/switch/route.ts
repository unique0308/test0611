import { NextResponse, type NextRequest } from "next/server";
import { _setMockSession } from "@/lib/auth/mock-login";
import { userExists, writeAuditLog, touchLastLogin } from "@/lib/db/queries";

// POST /api/auth/dev/switch
// Body: form-data { user_id: string }
// 设置 mock session cookie,写 audit_logs.login,redirect /
//
// ⚠️ 业务代码不应直接调这个端点,只在 /auth/dev 页面的 form action 触发

export async function POST(req: NextRequest) {
  if (process.env.AUTH_MODE === "real") {
    return new NextResponse("mock login disabled (AUTH_MODE=real)", { status: 404 });
  }
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }

  const formData = await req.formData();
  const userId = formData.get("user_id");
  if (typeof userId !== "string" || !userId) {
    return new NextResponse("invalid user_id", { status: 400 });
  }

  let exists: boolean;
  try {
    exists = await userExists(userId);
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    return new NextResponse(`database error: ${message}`, { status: 500 });
  }
  if (!exists) {
    return new NextResponse("user not found", { status: 404 });
  }

  _setMockSession(userId);

  await touchLastLogin(userId);
  await writeAuditLog({
    user_id: userId,
    action: "login",
    metadata: { source: "mock_dev_switch" },
    ip_address: req.headers.get("x-forwarded-for") ?? null
  });

  // 跳回首页(Day 4-5 替换为真实生成页)
  const origin = req.nextUrl.origin;
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}

// 登出
export async function DELETE() {
  if (process.env.AUTH_MODE === "real") {
    return new NextResponse("not allowed", { status: 404 });
  }
  // 清 cookie 由 logout() 处理
  const { logout } = await import("@/lib/auth");
  await logout();
  return new NextResponse(null, { status: 204 });
}
