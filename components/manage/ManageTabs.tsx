"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Day 45 管理面板 Tabs(设计参考 §4.3.B.1)
// 3 tab,无下拉;URL `?tab=` 同步以支持跨模块跳转(/admin → /manage?tab=audit&filter=pending)

export type ManageTab = "audit" | "quota" | "purposes";

const TABS: Array<{ id: ManageTab; label: string; alertProp?: "pending" }> = [
  { id: "audit", label: "报销审核", alertProp: "pending" },
  { id: "quota", label: "配额管理" },
  { id: "purposes", label: "使用目的管理" }
];

type Props = {
  active: ManageTab;
  pendingCount: number;
  panels: Record<ManageTab, React.ReactNode>;
};

export function ManageTabs({ active, pendingCount, panels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(tab: ManageTab) {
    const sp = new URLSearchParams(searchParams.toString());
    if (tab === "audit") sp.delete("tab");
    else sp.set("tab", tab);
    sp.delete("filter"); // 切 tab 时清掉残留的深链 filter,避免歧义
    const qs = sp.toString();
    router.push(`${pathname}${qs ? "?" + qs : ""}`, { scroll: false });
  }

  return (
    <>
      <div className="flex gap-1 border-b border-border mb-5">
        {TABS.map(t => {
          const showAlert = t.alertProp === "pending" && pendingCount > 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              className={
                "px-4 py-3 text-body font-medium border-b-2 transition inline-flex items-center gap-1.5 " +
                (active === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-text-2 hover:text-text")
              }
            >
              {t.label}
              {showAlert && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-sm text-chip font-medium bg-danger-soft text-danger num">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* 同 AdminTabs:全 panel 渲入 DOM,非 active 用 hidden,便于字符串/抓 HTML 检索 */}
      {TABS.map(t => (
        <div key={t.id} hidden={active !== t.id}>
          {panels[t.id]}
        </div>
      ))}
    </>
  );
}
