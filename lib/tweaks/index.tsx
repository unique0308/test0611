"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

// ─── Types ───────────────────────────────────────────────────────

export type AccentKey = "indigo" | "blue" | "violet" | "green" | "orange";
export type Density = "cozy" | "standard" | "comfortable";
export type Role = "employee" | "manager" | "admin";

export interface Tweaks {
  accent: AccentKey;
  sidebarCollapsed: boolean;
  density: Density;
  radius: number;
  fontScale: number;
  role: Role;
}

export const TWEAK_DEFAULTS: Tweaks = {
  accent: "indigo",
  sidebarCollapsed: false,
  density: "standard",
  radius: 12,
  fontScale: 1.0,
  role: "admin"
};

interface AccentPreset {
  accent: string;
  accentSoft: string;
  accentInk: string;
  accent2: string;
  glow: string;
}

export const ACCENT_PRESETS: Record<AccentKey, AccentPreset> = {
  indigo: {
    accent: "#6366F1",
    accentSoft: "#EEF0FF",
    accentInk: "#4F46E5",
    accent2: "#8B5CF6",
    glow: "rgba(99,102,241,.16)"
  },
  blue: {
    accent: "#2B6CFE",
    accentSoft: "#EAF0FF",
    accentInk: "#1E54D6",
    accent2: "#6366F1",
    glow: "rgba(43,108,254,.16)"
  },
  violet: {
    accent: "#8B5CF6",
    accentSoft: "#F1ECFF",
    accentInk: "#7C3AED",
    accent2: "#EC4899",
    glow: "rgba(139,92,246,.16)"
  },
  green: {
    accent: "#10B981",
    accentSoft: "#E5F4EA",
    accentInk: "#059669",
    accent2: "#0EA5E9",
    glow: "rgba(16,185,129,.16)"
  },
  orange: {
    accent: "#F97316",
    accentSoft: "#FFF1E5",
    accentInk: "#EA580C",
    accent2: "#EF4444",
    glow: "rgba(249,115,22,.16)"
  }
};

const STORAGE_KEY = "ai-platform.tweaks.v1";

// ─── Context ─────────────────────────────────────────────────────

interface TweaksContextValue {
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  resetTweaks: () => void;
  /** true 表示已读取过 localStorage（避免 SSR / 第一次渲染时主题闪烁判断） */
  hydrated: boolean;
}

const TweaksContext = createContext<TweaksContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────

export function TweaksProvider({ children }: { children: ReactNode }) {
  const [tweaks, setTweaks] = useState<Tweaks>(TWEAK_DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // 从 localStorage 注水
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Tweaks>;
        setTweaks((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore 解析失败
    }
    setHydrated(true);
  }, []);

  // 任意 tweak 变更 → 写回 localStorage + 注入 CSS 变量
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
    } catch {
      // ignore quota / 隐私模式
    }
    applyTweaksToRoot(tweaks);
  }, [tweaks, hydrated]);

  const setTweak = useCallback<TweaksContextValue["setTweak"]>((key, value) => {
    setTweaks((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetTweaks = useCallback(() => setTweaks(TWEAK_DEFAULTS), []);

  const value = useMemo<TweaksContextValue>(
    () => ({ tweaks, setTweak, resetTweaks, hydrated }),
    [tweaks, setTweak, resetTweaks, hydrated]
  );

  return <TweaksContext.Provider value={value}>{children}</TweaksContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────

export function useTweaks() {
  const ctx = useContext(TweaksContext);
  if (!ctx) {
    throw new Error("useTweaks 必须在 <TweaksProvider> 内使用");
  }
  return ctx;
}

/** 仅订阅当前角色，无需关心其他 tweak —— 给 Sidebar / 路由守卫等使用 */
export function useRole(): Role {
  return useTweaks().tweaks.role;
}

/** 仅订阅 density class 名（套在 .app-shell 上） */
export function useDensityClass(): string {
  const { tweaks } = useTweaks();
  return densityToClass(tweaks.density);
}

export function densityToClass(d: Density): string {
  return d === "cozy" ? "density-cozy" : d === "comfortable" ? "density-comfortable" : "";
}

// ─── 写入 CSS 变量 ───────────────────────────────────────────────

function applyTweaksToRoot(t: Tweaks) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const preset = ACCENT_PRESETS[t.accent] ?? ACCENT_PRESETS.indigo;

  root.style.setProperty("--accent", preset.accent);
  root.style.setProperty("--accent-soft", preset.accentSoft);
  root.style.setProperty("--accent-ink", preset.accentInk);
  root.style.setProperty("--accent-2", preset.accent2);
  root.style.setProperty("--accent-glow", preset.glow);
  root.style.setProperty(
    "--accent-shadow",
    `0 0 0 3px ${preset.glow}, 0 8px 24px ${preset.glow}`
  );
  root.style.setProperty("--s1", preset.accent);
  root.style.setProperty("--s2", preset.accent2);
  root.style.setProperty("--r-card", `${t.radius}px`);
  root.style.setProperty("--font-scale", String(t.fontScale));
  // V1 加 B(2026-05-29):强制 sidebar collapsed=64px,TweaksPanel 开关 V1 阶段无效。
  // V2 删除此行,恢复 tweaks 控制。
  const V1_FORCE_SIDEBAR_COLLAPSED = true;
  root.style.setProperty(
    "--sidebar-w",
    V1_FORCE_SIDEBAR_COLLAPSED || t.sidebarCollapsed ? "64px" : "232px"
  );
}

// ─── 角色默认落地路由（Phase 1 由 Sidebar 使用） ─────────────────

export const ROUTE_BY_ROLE: Record<Role, string> = {
  employee: "/",
  manager: "/manager/dashboard",
  admin: "/admin"
};

// 暴露上次角色记忆，用于角色切换后的自动跳转
export function usePrevRoleEffect(onChange: (next: Role) => void) {
  const { tweaks } = useTweaks();
  const prev = useRef(tweaks.role);
  useEffect(() => {
    if (prev.current !== tweaks.role) {
      const next = tweaks.role;
      prev.current = next;
      onChange(next);
    }
  }, [tweaks.role, onChange]);
}
