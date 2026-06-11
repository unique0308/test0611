"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { User } from "@/lib/types/user";
import { Icon, type IconName } from "@/components/ui/icons";
import { ROUTE_BY_ROLE, useTweaks, type Role } from "@/lib/tweaks";

// V2 侧边栏：品牌 + 角色感知菜单 + 折叠态 hover popover + 用户卡（含 role pill）
// 路由仍是 Next 文件路由；折叠/角色等本地状态由 lib/tweaks（localStorage 持久化）统一管理。
// 创作组的子项以 query 区分（/?kind=image / /?kind=video），对齐 ai-platform 现有路由。

type Props = {
  user: User;
  avatarSrc?: string | null;
};

interface NavSub {
  id: string;
  href: string;
  label: string;
  icon: IconName;
  matches: (pathname: string, search: URLSearchParams) => boolean;
}

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: IconName;
  subs?: NavSub[];
  badge?: number;
  matches: (pathname: string, search: URLSearchParams) => boolean;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const CREATE_ITEM: NavItem = {
  id: "generate",
  href: "/?kind=image",
  label: "创作",
  icon: "sparkle",
  matches: (p) => p === "/",
  subs: [
    {
      id: "generate.image",
      href: "/?kind=image",
      label: "图片生成",
      icon: "image",
      matches: (p, s) => p === "/" && (s.get("kind") ?? "image") === "image"
    },
    {
      id: "generate.video",
      href: "/?kind=video",
      label: "视频生成",
      icon: "video",
      matches: (p, s) => p === "/" && s.get("kind") === "video"
    }
  ]
};

const ASSET_ITEM: NavItem = {
  id: "assets",
  href: "/assets",
  label: "资产",
  icon: "folder",
  matches: (p) => p.startsWith("/assets")
};

const REIMB_ITEM: NavItem = {
  id: "reimbursement",
  href: "/reimbursement",
  label: "工具报销",
  icon: "receipt",
  matches: (p) => p.startsWith("/reimbursement")
};

const PROFILE_ITEM: NavItem = {
  id: "profile",
  href: "/profile",
  label: "个人中心",
  icon: "user",
  matches: (p) => p.startsWith("/profile")
};

const ADMIN_ITEM: NavItem = {
  id: "admin",
  href: "/admin",
  label: "数据看板",
  icon: "chart",
  // 注意：/admin/insights 不是数据看板，下面单独定义为 INSIGHTS_ITEM
  matches: (p) => p === "/admin" || (p.startsWith("/admin/") && !p.startsWith("/admin/insights"))
};

const EXECUTIVE_ITEM: NavItem = {
  id: "executive",
  href: "/admin_new",
  label: "老板驾驶舱",
  icon: "trend",
  matches: (p) => p === "/admin_new"
};

const INSIGHTS_ITEM: NavItem = {
  id: "insights",
  href: "/admin/insights",
  label: "AI 洞察",
  icon: "scan",
  matches: (p) => p.startsWith("/admin/insights")
};

const MANAGE_ITEM: NavItem = {
  id: "manage",
  href: "/manage",
  label: "管理面板",
  icon: "shield",
  matches: (p) => p === "/manage" || p.startsWith("/manage/")
};

const MANAGER_ITEM: NavItem = {
  id: "manager",
  href: "/manager/dashboard",
  label: "部门看板",
  icon: "building",
  matches: (p) => p.startsWith("/manager")
};

function buildNav(role: Role, manageBadge?: number): NavGroup[] {
  const workspace: NavGroup = {
    group: "工作台",
    items: [CREATE_ITEM, ASSET_ITEM, REIMB_ITEM]
  };
  const mine: NavGroup = { group: "我的", items: [PROFILE_ITEM] };

  if (role === "admin") {
    return [
      workspace,
      {
        group: "管理",
        items: [
          ADMIN_ITEM,
          EXECUTIVE_ITEM,
          INSIGHTS_ITEM,
          manageBadge ? { ...MANAGE_ITEM, badge: manageBadge } : MANAGE_ITEM
        ]
      },
      mine
    ];
  }
  if (role === "manager") {
    return [workspace, { group: "管理", items: [MANAGER_ITEM] }, mine];
  }
  return [workspace, mine];
}

const ROLE_LABEL: Record<Role, { label: string; cls: string }> = {
  employee: { label: "员工", cls: "" },
  manager: { label: "部门负责人", cls: "manager" },
  admin: { label: "管理员", cls: "admin" }
};

export function Sidebar({ user, avatarSrc }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const search = searchParams ?? new URLSearchParams();

  const { tweaks, setTweak } = useTweaks();
  // V1 加 B(2026-05-29):强制 collapsed=true,跟 lib/tweaks setProperty 联动
  // V2 反转回 tweaks.sidebarCollapsed
  const V1_FORCE_SIDEBAR_COLLAPSED = true;
  const collapsed = V1_FORCE_SIDEBAR_COLLAPSED || tweaks.sidebarCollapsed;
  const role = tweaks.role;

  const groups = buildNav(role);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ generate: true });

  // 角色切换时跳转到该角色的默认首页（与 V2 一致）
  const prevRoleRef = useRef<Role>(role);
  useEffect(() => {
    if (prevRoleRef.current !== role) {
      prevRoleRef.current = role;
      router.push(ROUTE_BY_ROLE[role]);
    }
  }, [role, router]);

  // 折叠态 hover popover
  // V1 加 B(2026-05-29):扁平项有文字标签不弹;**仅"创作"组(有 subs)弹 popover 显示 图片生成/视频生成**
  const [popover, setPopover] = useState<{ item: NavItem; top: number } | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const openPopover = (item: NavItem, rect: DOMRect) => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setPopover({ item, top: rect.top });
  };
  const closePopoverDelayed = () => {
    hoverTimeoutRef.current = window.setTimeout(() => setPopover(null), 120);
  };
  const cancelClose = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const isItemActive = (item: NavItem): boolean => {
    if (item.subs && item.subs.some((s) => s.matches(pathname, search))) return true;
    return item.matches(pathname, search);
  };

  const handleNavClick = (item: NavItem) => {
    if (item.subs) {
      if (collapsed) {
        router.push(item.subs[0].href);
      } else {
        setExpandedGroups((prev) => ({ ...prev, [item.id]: prev[item.id] === false }));
      }
    } else {
      router.push(item.href);
    }
  };

  return (
    <>
      <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <Link href="/" className="brand-mark" aria-label="AI 中台">
            ∞
          </Link>
          {!collapsed && (
            <>
              <div className="brand-name">
                AI 中台
                <span className="tag">v2</span>
              </div>
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => setTweak("sidebarCollapsed", true)}
                title="收起侧边栏"
                aria-label="收起侧边栏"
              >
                <Icon name="collapse" size={14} />
              </button>
            </>
          )}
        </div>

        {/* V1 加 B(2026-05-29):collapsed 强制,展开按钮删除(用户无法手动展开,sidebar 永远 64px) */}

        {/* Nav */}
        <div className="nav-scroll">
          {groups.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-group-label">{g.group}</div>
              {g.items.map((item) => {
                const active = isItemActive(item);
                const expanded = expandedGroups[item.id] !== false;
                const hasBadge = item.badge != null;
                return (
                  <div key={item.id}>
                    <div
                      className={`nav-item ${active ? "active" : ""} ${expanded ? "expanded" : ""} ${hasBadge ? "has-badge" : ""}`}
                      onClick={() => handleNavClick(item)}
                      onMouseEnter={(e) =>
                        collapsed && item.subs && item.subs.length > 0 && openPopover(item, e.currentTarget.getBoundingClientRect())
                      }
                      onMouseLeave={() => collapsed && item.subs && item.subs.length > 0 && closePopoverDelayed()}
                      title={collapsed ? item.label : undefined}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleNavClick(item);
                        }
                      }}
                    >
                      <Icon name={item.icon} size={17} className="ico" />
                      <span className="label">{item.label}</span>
                      {item.badge != null && <span className="badge num">{item.badge}</span>}
                      {item.subs && <Icon name="chevDown" size={14} className="chev" />}
                    </div>
                    {!collapsed &&
                      item.subs &&
                      expanded &&
                      item.subs.map((sub) => {
                        const subActive = sub.matches(pathname, search);
                        return (
                          <Link
                            key={sub.id}
                            href={sub.href}
                            className={`nav-subitem ${subActive ? "active" : ""}`}
                          >
                            <span className="dot" />
                            <span style={{ flex: 1 }}>{sub.label}</span>
                          </Link>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* User footer */}
        <Link
          href="/profile"
          className="sidebar-foot"
          title={`${user.name} · ${user.department_name ?? "未分配部门"}`}
        >
          <UserAvatar name={user.name} src={avatarSrc} />
          {!collapsed && (
            <>
              <div className="user-meta">
                <div className="user-name flex items-center gap-2">
                  <span className="truncate">{user.name}</span>
                  <span className={`role-pill ${ROLE_LABEL[role].cls}`}>
                    <span
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 999,
                        background: "currentColor"
                      }}
                    />
                    {ROLE_LABEL[role].label}
                  </span>
                </div>
                <div className="user-dept">{user.department_name ?? "未分配部门"}</div>
              </div>
              <Icon name="more" size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
            </>
          )}
        </Link>
      </aside>

      {/* Collapsed hover popover */}
      {collapsed && popover && (
        <div
          className="popover"
          style={{ left: 72, top: Math.max(8, popover.top - 8) }}
          onMouseEnter={cancelClose}
          onMouseLeave={closePopoverDelayed}
        >
          <div className="popover-title">{popover.item.label}</div>
          {popover.item.subs ? (
            popover.item.subs.map((sub) => {
              const subActive = sub.matches(pathname, search);
              return (
                <Link
                  key={sub.id}
                  href={sub.href}
                  className={`popover-item ${subActive ? "active" : ""}`}
                  onClick={() => setPopover(null)}
                >
                  <Icon name={sub.icon} size={15} className="ico" />
                  <span style={{ flex: 1 }}>{sub.label}</span>
                </Link>
              );
            })
          ) : (
            <Link
              href={popover.item.href}
              className={`popover-item ${popover.item.matches(pathname, search) ? "active" : ""}`}
              onClick={() => setPopover(null)}
            >
              <Icon name={popover.item.icon} size={15} className="ico" />
              <span style={{ flex: 1 }}>打开 {popover.item.label}</span>
              {popover.item.badge != null && (
                <span
                  className="badge num"
                  style={{
                    background: "var(--danger)",
                    color: "#fff",
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600
                  }}
                >
                  {popover.item.badge}
                </span>
              )}
            </Link>
          )}
        </div>
      )}
    </>
  );
}

function UserAvatar({ name, src }: { name: string; src?: string | null }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className="avatar"
        style={{ background: "transparent", objectFit: "cover" }}
      />
    );
  }
  return <span className="avatar">{name.slice(0, 1)}</span>;
}
