"use client";

import {
  CountUp,
  DualBarChart,
  StatusBadge,
  fmtInt,
  fmtPct
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import type { User } from "@/lib/types/user";
import type { UsageDashboardData, QuotaSnapshot } from "@/lib/db/queries";
import { PROFILE_FIXTURE } from "@/lib/fixtures/profile";

// /profile · V2 ViewProfile（来源：view-profile.jsx）
// - Hero 区：大头像 + 角色 pill + 累计统计三连
// - 三卡：配额（主卡 1.5fr）+ 图片 + 视频
// - 14 日双色柱图
// - 用途分布（水平条）+ 常用模型 Top 表
// 数据：UsageDashboardData（真实） + PROFILE_FIXTURE（缺口占位）

interface Props {
  user: User;
  totalSucceededCount: number;
  usage: UsageDashboardData;
  avatarSrc?: string | null;
  /** 所在部门当月配额快照（null = 用户未分配部门） */
  deptQuota: QuotaSnapshot | null;
}

const PURPOSE_COLORS = ["#6366F1", "#8B5CF6", "#16A34A", "#F59E0B", "#EC4899", "#94979F"];

export function ProfileView({ user, totalSucceededCount, usage, avatarSrc, deptQuota }: Props) {
  const pct = usage.personal_pct_used;
  const tier = pct >= 100 ? "danger" : pct >= 85 ? "warn" : "ok";
  const colorVar =
    tier === "danger"
      ? "var(--danger)"
      : tier === "warn"
        ? "var(--warn)"
        : "var(--accent)";
  const fillCls = tier === "danger" ? "danger" : tier === "warn" ? "warn" : "accent";

  // 角色 pill 显示真实身份（不跟 tweaks 走，避免误导）
  const roleLabel = user.is_admin ? "管理员" : user.is_dept_manager ? "部门负责人" : "员工";
  const roleCls = user.is_admin ? "admin" : user.is_dept_manager ? "manager" : "";

  // Hero 统计 — 只用真实数据，避免与下方"本月图片/视频"卡矛盾
  // 后端目前只给 total_succeeded_count（累计任务总数），没有按 type 拆分
  // 加入时间 = user.created_at，"加入至今 N 天"作第三个统计
  const lifeTotal = totalSucceededCount;
  const joinDate = user.created_at ? new Date(user.created_at) : null;
  const joinedDays = joinDate
    ? Math.max(0, Math.floor((Date.now() - joinDate.getTime()) / 86400000))
    : null;
  const joinedLabel = joinDate
    ? `${joinDate.getFullYear()}.${String(joinDate.getMonth() + 1).padStart(2, "0")}`
    : "—";

  // 后端缺 costPts → 估算
  const imgCostPts = usage.image_count * PROFILE_FIXTURE.imgPtsPerCount;
  const vidCostPts = usage.video_count * PROFILE_FIXTURE.vidPtsPerCount;

  // 把 daily 转成 DualBarChart 期望的 { d, img, vid } 形态
  // 顺带按 fixture 估算"当日积分"提供给 tooltip（后端补 daily credits 后替换）
  const trendData = usage.daily.map((d) => ({
    d: d.label,
    img: d.image,
    vid: d.video,
    imgCredits: d.image * PROFILE_FIXTURE.imgPtsPerCount,
    vidCredits: d.video * PROFILE_FIXTURE.vidPtsPerCount
  }));

  // purposes 后端只有 count → 推 share
  const purposeTotal = usage.purposes.reduce((s, p) => s + p.count, 0) || 1;
  const purposeView = usage.purposes.slice(0, 5).map((p) => ({
    label: p.name,
    share: Math.round((p.count / purposeTotal) * 1000) / 10,
    pts: p.count * PROFILE_FIXTURE.imgPtsPerCount
  }));

  return (
    <div className="page" data-screen-label="Profile">
      <div className="crumb">
        <span>我的</span>
        <Icon name="chev" size={10} className="sep" />
        <span style={{ color: "var(--text-2)" }}>个人中心</span>
      </div>

      {/* 部门配额条 — 员工最关心的"我部门还能用多少"，hero 上方显眼位 */}
      {deptQuota && user.department_name && (
        <DeptQuotaStrip
          deptName={user.department_name}
          used={deptQuota.used_credits}
          limit={deptQuota.limit_credits}
          warning={deptQuota.warning}
        />
      )}

      {/* Hero */}
      <div className="profile-hero">
        <div className="flex items-center gap-4">
          <ProfileAvatar name={user.name} src={avatarSrc} />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
                {user.name}
              </span>
              <span className={`role-pill ${roleCls}`}>
                <span
                  style={{ width: 4, height: 4, borderRadius: 999, background: "currentColor" }}
                />
                {roleLabel}
              </span>
            </div>
            <div className="t-sub" style={{ color: "var(--text-3)" }}>
              {(user.department_name ?? "未分配部门") + " · " + user.email}
            </div>
          </div>
          <div
            className="flex gap-6"
            style={{ paddingLeft: 24, borderLeft: "1px solid var(--border)" }}
          >
            <ProfileStat
              label="累计生成"
              value={lifeTotal}
              unit="次"
              hint="入职至今 · 图 + 视频合计"
            />
            <ProfileStat
              label="本月已生成"
              value={usage.total_count}
              unit="次"
              hint={`图 ${usage.image_count} · 视 ${usage.video_count}`}
            />
            <ProfileStat
              label="加入"
              displayValue={joinedLabel}
              unit={joinedDays != null ? `· ${joinedDays} 天` : ""}
            />
          </div>
        </div>
      </div>

      {/* Quota + Output cards */}
      <div className="grid mt-4" style={{ gridTemplateColumns: "1.5fr 1fr 1fr", gap: 12 }}>
        {/* Quota main card */}
        <div className="card card-pad" style={{ position: "relative", overflow: "hidden" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="t-sub" style={{ fontWeight: 500, color: "var(--text-2)" }}>
                本月配额
              </div>
              <div className="t-cap" style={{ marginTop: 2 }}>
                额度仅作软提示 · 超额仍可正常使用
              </div>
            </div>
            <StatusBadge status={tier === "ok" ? "ok" : tier === "warn" ? "warn" : "danger"} />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="num"
              style={{
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: colorVar
              }}
            >
              <CountUp value={usage.personal_credits_used} fmt={fmtInt} />
            </span>
            <span className="num" style={{ fontSize: 14, color: "var(--text-3)" }}>
              / {fmtInt(usage.personal_credits_limit)} 积分
            </span>
          </div>
          <div className="bar mt-3" style={{ height: 8 }}>
            <div
              className={`bar-fill ${fillCls}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div
            className="flex items-center justify-between mt-2"
            style={{ fontSize: 11.5, color: "var(--text-3)" }}
          >
            <span>
              已用{" "}
              <span className="num fw-6" style={{ color: "var(--text-2)" }}>
                {fmtPct(pct)}
              </span>
            </span>
            <span>
              剩余{" "}
              <span className="num fw-6" style={{ color: "var(--text-2)" }}>
                {fmtInt(usage.personal_credits_remaining)}
              </span>{" "}
              积分
            </span>
            <span>{usage.reset_label} 重置</span>
          </div>
        </div>

        {/* 图片产出卡 */}
        <ProductionCard
          kind="image"
          count={usage.image_count}
          costPts={imgCostPts}
          unit="张"
          iconCls="success"
        />
        {/* 视频产出卡 */}
        <ProductionCard
          kind="video"
          count={usage.video_count}
          costPts={vidCostPts}
          unit="个"
          iconCls="violet"
        />
      </div>

      {/* 14-day trend */}
      <div className="section" style={{ marginTop: 24 }}>
        <div className="section-head">
          <div className="section-title">最近 14 天用量</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              <span className="flex items-center gap-1">
                <span
                  style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent)" }}
                />{" "}
                图片
              </span>
              <span className="flex items-center gap-1">
                <span
                  style={{ width: 8, height: 8, borderRadius: 2, background: "var(--violet)" }}
                />{" "}
                视频
              </span>
            </div>
          </div>
        </div>
        <div className="card card-pad">
          {trendData.length === 0 || trendData.every((d) => d.img + d.vid === 0) ? (
            <div className="py-10 text-center t-sub" style={{ color: "var(--text-3)" }}>
              本月还没有生成记录
            </div>
          ) : (
            <DualBarChart data={trendData} height={220} />
          )}
        </div>
      </div>

      {/* Breakdown — 装饰展示型，参照"用途分布 / 常用模型"参考图：大标题、宽行距、粗进度条 */}
      <div className="grid mt-6" style={{ gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
        <div
          className="card"
          style={{ padding: "22px 24px 26px" }}
        >
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              marginBottom: 18,
              fontFamily: "var(--font-display)"
            }}
          >
            用途分布
          </div>
          {purposeView.length === 0 ? (
            <div className="py-6 text-center t-sub" style={{ color: "var(--text-3)" }}>
              暂无数据
            </div>
          ) : (
            <div className="flex-col" style={{ gap: 18 }}>
              {purposeView.map((it, i) => (
                <div key={it.label}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                      fontSize: 13.5
                    }}
                  >
                    <span
                      className="flex items-center"
                      style={{ gap: 8, fontWeight: 500, color: "var(--text)" }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: PURPOSE_COLORS[i % PURPOSE_COLORS.length]
                        }}
                      />
                      {it.label}
                    </span>
                    <span
                      className="num"
                      style={{ color: "var(--text-3)", fontSize: 12 }}
                    >
                      <span style={{ color: "var(--text-2)", fontWeight: 600 }}>
                        {it.share}%
                      </span>
                      <span style={{ marginLeft: 6 }}>· {fmtInt(it.pts)} 积分</span>
                    </span>
                  </div>
                  <div className="bar" style={{ height: 8 }}>
                    <div
                      className="bar-fill"
                      style={{
                        width: it.share + "%",
                        background: PURPOSE_COLORS[i % PURPOSE_COLORS.length]
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: "22px 24px 14px" }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              marginBottom: 14,
              fontFamily: "var(--font-display)"
            }}
          >
            常用模型
          </div>
          {usage.models.length === 0 ? (
            <div className="py-6 text-center t-sub" style={{ color: "var(--text-3)" }}>
              暂无数据
            </div>
          ) : (
            <div>
              {usage.models.slice(0, 5).map((m, i) => (
                <div
                  key={m.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "14px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    fontSize: 14
                  }}
                >
                  <span
                    className="num"
                    style={{ width: 28, color: "var(--text-3)", fontSize: 13 }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, color: "var(--text)" }}>{m.name}</span>
                  <span
                    className="num"
                    style={{ color: "var(--text-3)", fontSize: 12 }}
                  >
                    {fmtInt(m.count)} 次
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 子组件 ───────────────────────────────────────────────────

function DeptQuotaStrip({
  deptName,
  used,
  limit,
  warning
}: {
  deptName: string;
  used: number;
  limit: number;
  warning: "green" | "yellow" | "red";
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const remaining = Math.max(0, limit - used);
  const tone =
    warning === "red"
      ? { fg: "var(--danger)", bg: "var(--danger-soft, #FDECEC)", fill: "var(--danger)" }
      : warning === "yellow"
        ? { fg: "var(--warn)", bg: "var(--warn-soft)", fill: "var(--warn)" }
        : { fg: "var(--success)", bg: "var(--success-soft)", fill: "var(--accent)" };
  const hint =
    warning === "red"
      ? "已超出本月部门上限，与负责人确认"
      : warning === "yellow"
        ? "部门用量接近上限，注意节制"
        : "部门用量充裕";
  return (
    <div
      className="card"
      style={{
        padding: "10px 14px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap"
      }}
    >
      <Icon name="building" size={14} style={{ color: tone.fg, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>
        {deptName} · 本月部门配额
      </span>
      <span
        className="num"
        style={{
          fontSize: 11.5,
          color: tone.fg,
          fontWeight: 600,
          padding: "1px 7px",
          borderRadius: 999,
          background: tone.bg
        }}
      >
        {Math.round(pct)}%
      </span>
      <div
        style={{
          flex: 1,
          minWidth: 120,
          height: 6,
          background: "var(--border)",
          borderRadius: 999,
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: tone.fill,
            transition: "width .3s"
          }}
        />
      </div>
      <span
        className="num"
        style={{ fontSize: 11.5, color: "var(--text-2)", fontFamily: "var(--font-mono)" }}
      >
        {used.toLocaleString()} / {limit.toLocaleString()} 积分
      </span>
      <span style={{ fontSize: 11, color: "var(--text-3)" }}>· 剩 {remaining.toLocaleString()}</span>
      <span style={{ fontSize: 11, color: tone.fg, fontWeight: 500 }}>· {hint}</span>
    </div>
  );
}

function ProfileAvatar({ name, src }: { name: string; src?: string | null }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className="profile-avatar-lg"
        style={{ background: "transparent", objectFit: "cover" }}
      />
    );
  }
  return <div className="profile-avatar-lg">{name.slice(0, 1)}</div>;
}

function ProfileStat({
  label,
  value,
  displayValue,
  unit,
  hint
}: {
  label: string;
  value?: number;
  /** 自定义显示文案（如"2024.03"），优先级高于 value */
  displayValue?: string;
  unit: string;
  /** 可选小字提示（一行说明这一格的口径） */
  hint?: string;
}) {
  return (
    <div title={hint}>
      <div className="t-cap" style={{ textTransform: "none", fontSize: 11.5, marginBottom: 2 }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="num fw-6" style={{ fontSize: 20, letterSpacing: "-0.015em" }}>
          {displayValue != null ? displayValue : <CountUp value={value ?? 0} fmt={fmtInt} />}
        </span>
        <span className="num" style={{ fontSize: 11, color: "var(--text-3)" }}>
          {unit}
        </span>
      </div>
      {hint && (
        <div
          style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2, whiteSpace: "nowrap" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function ProductionCard({
  kind,
  count,
  costPts,
  unit,
  iconCls
}: {
  kind: "image" | "video";
  count: number;
  costPts: number;
  unit: string;
  iconCls: string;
}) {
  const title = kind === "image" ? "本月图片" : "本月视频";
  const avg = count > 0 ? costPts / count : 0;
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between mb-3">
        <div className="t-sub fw-6">{title}</div>
        <div className={`kpi-icon-block ${iconCls}`}>
          <Icon name={kind} size={13} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="num" style={{ fontSize: 24, fontWeight: 600 }}>
          <CountUp value={count} fmt={fmtInt} />
        </span>
        <span className="num" style={{ fontSize: 12, color: "var(--text-3)" }}>
          {unit}
        </span>
      </div>
      <div className="t-cap mt-2">
        消耗{" "}
        <span className="num fw-6" style={{ color: "var(--text-2)" }}>
          {fmtInt(costPts)}
        </span>{" "}
        积分 · 均{" "}
        <span className="num">{avg.toFixed(kind === "image" ? 1 : 0)}</span> /
        {unit}
      </div>
    </div>
  );
}
