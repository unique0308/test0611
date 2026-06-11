"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import type { Insight, InsightCategory } from "@/lib/admin/insights/types";

// /admin 首屏顶部 · AI 洞察紧凑条
// 设计目标：admin 进 /admin 第一眼就看到"今天有几件事要做"
//
// 交互：
//   - 每条洞察整行可点 → 跳 /admin/insights#<key> 并自动展开+高亮
//   - "收起"按钮默认隐藏；hover banner 时上方中央凸出折叠按钮；移开消失
//   - 行 hover：抬起 2px + 阴影 + 背景渐变
//   - 折叠/展开有 transition
//   - 0 告警时变绿色"AI 洞察 · 运行正常"，无 hover 按钮

const STORAGE_KEY = "admin:insights-banner-collapsed";
const TOP_N = 3;

type Props = {
  urgent: Insight[];
  normalCount: number;
  activeCount: number;
  activeByCategory: Record<InsightCategory, number>;
  /** 数据信号 active 总数（非紧急、参考性质）— 在 banner 右下加弱链接 */
  signalCount: number;
};

const CAT_LABEL: Record<InsightCategory, string> = {
  quota: "配额",
  model: "模型",
  spend: "支出",
  user: "用户"
};
const CAT_COLOR: Record<InsightCategory, string> = {
  quota: "var(--violet)",
  model: "var(--accent)",
  spend: "var(--warn)",
  user: "var(--success)"
};

export function InsightsBanner({
  urgent,
  normalCount,
  activeCount,
  activeByCategory,
  signalCount
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  // 0 告警 → 绿色运行正常态；如有数据信号在右侧弱链接展示
  if (activeCount === 0) {
    return (
      <div
        className="card"
        style={{
          padding: "10px 14px",
          marginBottom: 14,
          background: "var(--success-soft)",
          borderColor: "color-mix(in srgb, var(--success) 25%, transparent)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13
        }}
      >
        <Icon name="check" size={14} style={{ color: "var(--success)" }} />
        <span style={{ color: "var(--success)", fontWeight: 500 }}>AI 洞察 · 运行正常</span>
        <span style={{ color: "var(--text-3)", fontSize: 12 }}>
          硬指标告警暂无
        </span>
        <span style={{ flex: 1 }} />
        {signalCount > 0 && (
          <Link
            href="/admin/insights"
            style={{
              fontSize: 11.5,
              color: "var(--text-3)",
              textDecoration: "none"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-ink)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
          >
            另有 {signalCount} 条数据信号可参考 →
          </Link>
        )}
      </div>
    );
  }

  const topUrgent = urgent.slice(0, TOP_N);
  const overflowUrgent = Math.max(0, urgent.length - TOP_N);
  const hasOverflow = overflowUrgent > 0 || normalCount > 0;

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: "relative",
        marginBottom: 14
      }}
    >
      {/* hover-only 折叠按钮 · 顶部中央凸起 */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "展开 AI 洞察" : "收起 AI 洞察"}
        title={collapsed ? "展开" : "收起"}
        style={{
          position: "absolute",
          top: -12,
          left: "50%",
          transform: `translateX(-50%) translateY(${hovering ? 0 : 6}px)`,
          opacity: hovering ? 1 : 0,
          pointerEvents: hovering ? "auto" : "none",
          width: 28,
          height: 24,
          padding: 0,
          borderRadius: 999,
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--text-2)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,.08)",
          transition: "opacity .18s, transform .18s, color .15s, border-color .15s",
          zIndex: 3
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text)";
          e.currentTarget.style.borderColor = "var(--border-strong)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-2)";
          e.currentTarget.style.borderColor = "var(--border)";
        }}
      >
        <Icon
          name="chevDown"
          size={11}
          style={{
            transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform .2s"
          }}
        />
      </button>

      <div
        className="card"
        style={{
          padding: "12px 16px",
          borderLeft: `3px solid ${urgent.length > 0 ? "var(--danger)" : "var(--warn)"}`,
          background: "var(--card)",
          transition: "padding .2s"
        }}
      >
        {/* 头部 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: collapsed ? 0 : 10
          }}
        >
          <Icon
            name="scan"
            size={15}
            style={{ color: urgent.length > 0 ? "var(--danger)" : "var(--warn)" }}
          />
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>AI 洞察</span>
          <span style={{ color: "var(--text-3)", fontSize: 12 }}>
            {urgent.length > 0 && (
              <>
                <span className="num" style={{ color: "var(--danger)", fontWeight: 600 }}>
                  {urgent.length}
                </span>{" "}
                紧急
              </>
            )}
            {urgent.length > 0 && normalCount > 0 && " · "}
            {normalCount > 0 && (
              <>
                <span className="num" style={{ color: "var(--warn)", fontWeight: 600 }}>
                  {normalCount}
                </span>{" "}
                待关注
              </>
            )}
          </span>
          <span style={{ flex: 1 }} />
          {/* 分类构成角标：admin 一眼看出今天主要是哪类问题 */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontSize: 11.5,
              color: "var(--text-3)"
            }}
          >
            {(["quota", "model", "user", "spend"] as InsightCategory[])
              .filter((c) => activeByCategory[c] > 0)
              .map((c) => (
                <span
                  key={c}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: CAT_COLOR[c]
                    }}
                  />
                  {CAT_LABEL[c]}
                  <span
                    className="num"
                    style={{
                      color: "var(--text-2)",
                      fontWeight: 600
                    }}
                  >
                    {activeByCategory[c]}
                  </span>
                </span>
              ))}
          </div>
        </div>

        {/* 紧急洞察 top N */}
        {!collapsed && topUrgent.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              animation: "insights-fade-in .25s ease-out"
            }}
          >
            {topUrgent.map((it) => (
              <BannerRow key={it.key} insight={it} />
            ))}
            {hasOverflow && (
              <Link
                href="/admin/insights"
                style={{
                  fontSize: 11.5,
                  color: "var(--text-3)",
                  paddingLeft: 22,
                  paddingTop: 4,
                  textDecoration: "none",
                  transition: "color .15s"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-ink)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
              >
                {overflowUrgent > 0 && `+${overflowUrgent} 项紧急 · `}
                {normalCount > 0 && `${normalCount} 项待关注 · `}
                进 AI 洞察查看与处理 →
              </Link>
            )}
          </div>
        )}

        {/* 没有紧急但有 normal */}
        {!collapsed && topUrgent.length === 0 && normalCount > 0 && (
          <div style={{ fontSize: 12.5, color: "var(--text-2)", paddingLeft: 22 }}>
            {normalCount} 项待关注（非紧急）·{" "}
            <Link
              href="/admin/insights"
              style={{ color: "var(--accent-ink)", textDecoration: "none" }}
            >
              进 AI 洞察查看 →
            </Link>
          </div>
        )}

        {/* 数据信号弱链接（只要有就显示，与告警并存） */}
        {!collapsed && signalCount > 0 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              paddingLeft: 22,
              paddingTop: 6,
              marginTop: 4,
              borderTop: "1px dashed var(--border)"
            }}
          >
            <Link
              href="/admin/insights?kind=signal"
              style={{
                color: "var(--text-3)",
                textDecoration: "none"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-ink)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
            >
              另有 {signalCount} 条数据信号可参考（非告警，仅供观察）→
            </Link>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes insights-fade-in {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function BannerRow({ insight }: { insight: Insight }) {
  const [hover, setHover] = useState(false);
  const href = `/admin/insights#${encodeURIComponent(insight.key)}`;

  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 10px 8px 8px",
        fontSize: 12.5,
        textDecoration: "none",
        borderRadius: 8,
        background: hover
          ? "color-mix(in srgb, var(--danger-soft, #FDECEC) 60%, transparent)"
          : "transparent",
        boxShadow: hover ? "0 2px 8px rgba(0,0,0,.05)" : "none",
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        transition:
          "background .18s ease-out, box-shadow .18s ease-out, transform .18s ease-out"
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "var(--danger)",
          marginTop: 7,
          flexShrink: 0
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "var(--text)",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {insight.title}
        </div>
        <div
          style={{
            color: "var(--text-3)",
            fontSize: 11.5,
            marginTop: 2,
            display: "flex",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          {insight.metrics.slice(0, 3).map((m, i) => (
            <span key={i}>
              {m.label}{" "}
              <span className="num" style={{ color: "var(--text-2)" }}>
                {m.value}
              </span>
            </span>
          ))}
        </div>
      </div>
      <Icon
        name="chev"
        size={10}
        style={{
          color: hover ? "var(--accent-ink)" : "var(--text-3)",
          transform: `rotate(-90deg) translateX(${hover ? -2 : 0}px)`,
          transition: "transform .18s, color .15s",
          marginTop: 6,
          flexShrink: 0
        }}
      />
    </Link>
  );
}
