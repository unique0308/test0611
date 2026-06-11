import { requireAuth } from "@/lib/auth";
import { getSignedUrl } from "@/lib/storage";
import { ProfileView } from "@/components/profile/ProfileView";
import {
  getProfileHeaderStats,
  getPersonalUsageDashboard,
  getDepartmentQuotaSnapshot,
  type QuotaSnapshot
} from "@/lib/db/queries";

// /profile 个人中心（2026-05-25 V2 重塑）
// 单一职责：个人 AI 用量自我观测
// V2 视觉规格：原型设计V2/view-profile.jsx
// 实现：components/profile/ProfileView.tsx

export const dynamic = "force-dynamic";

async function signAvatar(avatarUrl: string | null): Promise<string | null> {
  if (!avatarUrl) return null;
  if (/^https?:\/\//.test(avatarUrl)) return avatarUrl;
  try {
    return await getSignedUrl(avatarUrl);
  } catch {
    return null;
  }
}

export default async function ProfilePage() {
  const user = await requireAuth();

  const [stats, usage, avatarSrc, deptQuota] = await Promise.all([
    getProfileHeaderStats({ user_id: user.id }),
    getPersonalUsageDashboard({
      user_id: user.id,
      department_id: user.department_id,
      personal_quota_credits: user.monthly_quota_credits,
      include_dept_overview: user.is_dept_manager && !user.is_admin
    }),
    signAvatar(user.avatar_url),
    user.department_id
      ? getDepartmentQuotaSnapshot(user.department_id)
      : Promise.resolve<QuotaSnapshot | null>(null)
  ]);

  return (
    <ProfileView
      user={user}
      totalSucceededCount={stats.total_succeeded_count}
      usage={usage}
      avatarSrc={avatarSrc}
      deptQuota={deptQuota}
    />
  );
}
