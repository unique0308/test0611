import { notFound } from "next/navigation";
import { listMockUsers } from "@/lib/db/queries";

// Mock 开发登录页(设计参考 4.0)
// AUTH_MODE=mock 且非生产环境才显示;否则 notFound
// 6 个员工按钮,form action POST /api/auth/dev/switch,无 client JS

export const dynamic = "force-dynamic";

export default async function DevLoginPage() {
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.AUTH_MODE === "real") notFound();

  let users: Awaited<ReturnType<typeof listMockUsers>> = [];
  let dbError: string | null = null;
  try {
    users = await listMockUsers();
  } catch (e) {
    dbError = (e as Error).message;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="bg-card border border-border rounded-lg shadow-md p-6 w-[400px]">
        <h2 className="text-[18px] font-semibold leading-tight">开发模式登录</h2>
        <p className="text-small text-text-3 mt-1">仅 mock 模式可见,生产环境不存在</p>

        {dbError && (
          <div className="mt-4 p-3 rounded bg-danger-soft text-danger text-small">
            数据库连接错误:{dbError}
          </div>
        )}

        {!dbError && users.length === 0 && (
          <div className="mt-4 p-3 rounded bg-warn-soft text-warn text-small">
            未发现 mock 用户,请先跑 <code>npm run db:migrate</code>。
          </div>
        )}

        <div className="mt-6 space-y-2">
          {users.map(u => (
            <form
              key={u.id}
              action="/api/auth/dev/switch"
              method="POST"
              className="block"
            >
              <input type="hidden" name="user_id" value={u.id} />
              <button
                type="submit"
                className={
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md border " +
                  "border-border hover:border-border-strong hover:bg-bg " +
                  "transition text-left"
                }
              >
                <Avatar name={u.name} />
                <span className="flex-1 min-w-0">
                  <span className="block text-body font-medium truncate">
                    {u.name}
                  </span>
                  <span className="block text-small text-text-2 truncate">
                    {u.department_name ?? "无部门"}
                  </span>
                </span>
                {u.is_admin && (
                  <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-sm text-chip bg-primary-soft text-primary">
                    管理员
                  </span>
                )}
              </button>
            </form>
          ))}
        </div>

        <p className="mt-6 text-small text-text-3">
          切换身份后会写一条 <code>audit_logs.action=login</code>,7 天有效。
        </p>
      </div>
    </main>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.slice(0, 1);
  return (
    <span
      aria-hidden
      className="shrink-0 w-7 h-7 rounded-full bg-primary-soft text-primary text-small font-medium inline-flex items-center justify-center"
    >
      {initial}
    </span>
  );
}
