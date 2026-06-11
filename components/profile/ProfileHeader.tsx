import type { User } from "@/lib/types/user";
import type { ProfileHeaderStats } from "@/lib/db/queries";

// 个人中心 Header(2026-05-25 Day 44 重塑规格 §3.2,精简版)
// 保留:头像 / 姓名 / 角色 pill / meta 三项(部门 + 加入时间 + 邮箱)
// 右侧:终身统计 1 项「累计生成 X 次」(spec §3.2:月度数据下移到用量核心区,Header 不重复)
// 角色 pill 默认蓝色版(D4:不补金色「高级创作者」)
// 右上角装饰光斑保留,克制即可

type Props = {
  user: User;
  stats: ProfileHeaderStats;
  avatarSrc: string | null; // 已签名头像 URL;null 走姓名首字渐变占位
};

export function ProfileHeader({ user, stats, avatarSrc }: Props) {
  return (
    <section className="relative overflow-hidden bg-card border border-border rounded-xl shadow-sm px-7 py-5 flex items-center gap-5">
      {/* 装饰光斑:右上紫色径向,克制 */}
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: "-40px",
          right: "-50px",
          width: "220px",
          height: "220px",
          background:
            "radial-gradient(circle at 50% 50%, rgba(123,92,255,.12), transparent 65%)"
        }}
      />

      {/* 头像:64×64 圆角;有上传图用图,否则姓名首字橙红渐变 */}
      <div className="relative z-[1] shrink-0">
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt={user.name}
            className="w-16 h-16 rounded-2xl object-cover shadow-sm ring-2 ring-white"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-2xl text-white font-semibold text-h1 inline-flex items-center justify-center shadow-sm ring-2 ring-white"
            style={{ background: "linear-gradient(135deg, #FF8A6B, #FF5A8A)" }}
          >
            {user.name.slice(0, 1)}
          </div>
        )}
      </div>

      {/* 姓名 + 角色 pill + meta(部门 / 加入时间 / 邮箱)*/}
      <div className="flex-1 min-w-0 relative z-[1]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[18px] leading-[24px] font-semibold text-text">
            {user.name}
          </span>
          {user.is_admin && <RolePill>管理员</RolePill>}
          {user.is_dept_manager && <RolePill>部门负责人</RolePill>}
        </div>
        <div className="text-sub text-text-2 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
          <span className="inline-flex items-center gap-1.5">
            <DeptIcon />
            {user.department_name ?? "未分配部门"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-text-3">
            <CalendarIcon />
            {formatJoinedAt(user.created_at)}加入
          </span>
          <span className="inline-flex items-center gap-1.5 text-text-3">
            <MailIcon />
            {user.email}
          </span>
        </div>
      </div>

      {/* 右侧 1 个终身统计:累计生成 X 次 */}
      <div className="pl-6 border-l border-border relative z-[1] shrink-0">
        <div className="text-cap text-text-3 mb-0.5">累计生成</div>
        <div className="text-[22px] leading-[28px] font-semibold num text-text">
          {stats.total_succeeded_count.toLocaleString()}
          <span className="text-cap text-text-3 font-medium ml-1">次</span>
        </div>
      </div>
    </section>
  );
}

// 默认蓝色版角色 pill(D4:不做金色「高级创作者」)
function RolePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-sm text-chip font-medium bg-primary-soft text-primary">
      {children}
    </span>
  );
}

// "2026 年 5 月加入" / 缺失数据兜底
function formatJoinedAt(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

function DeptIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
