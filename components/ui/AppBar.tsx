import Link from "next/link";
import type { User } from "@/lib/auth";

// App bar 56px(原型 .appbar:高 56px / 白底 / 底 1px border / sticky / padding 0 28px / gap 16px)
// 面包屑结构:.crumb(text-3 13px gap 8px)+ .sep(灰)+ .now(text fw500)
// 右侧:用户信息 + admin chip + 切换 link

type Props = {
  title: string;
  subtitle?: string;
  user: User;
};

export function AppBar({ title, subtitle, user }: Props) {
  return (
    <header className="h-appbar bg-card border-b border-border flex items-center px-7 sticky top-0 z-[5] gap-4">
      <div className="flex-1 min-w-0 inline-flex items-center gap-2 text-sub text-text-3">
        <span>{title}</span>
        {subtitle && (
          <>
            <span className="text-[#CFD3DB]">/</span>
            <span className="text-text font-medium">{subtitle}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-small text-text-2">
          {user.name}
          {user.department_name && <span className="text-text-3"> · {user.department_name}</span>}
        </span>
        {user.is_admin && (
          <span className="px-2 py-0.5 rounded-sm text-chip bg-primary-soft text-primary">
            管理员
          </span>
        )}
        <Link
          href="/auth/dev"
          className="text-small text-text-3 hover:text-primary px-2 py-1 rounded hover:bg-bg"
        >
          切换
        </Link>
      </div>
    </header>
  );
}
