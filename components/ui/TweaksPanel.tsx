"use client";

import { useState } from "react";
import {
  ACCENT_PRESETS,
  useTweaks,
  type AccentKey,
  type Density,
  type Role
} from "@/lib/tweaks";

/**
 * 浮动个性化面板（右下角）
 * 主色 / 信息密度 / 圆角 / 字号 / 侧边栏收起 / 身份切换
 * 配置持久化到 localStorage（由 TweaksProvider 处理）
 */
export function TweaksPanel() {
  const { tweaks, setTweak, resetTweaks } = useTweaks();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? "关闭个性化面板" : "打开个性化面板"}
        className="fixed bottom-5 right-5 z-[9998] flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-text-2 shadow-md transition hover:text-accent-ink hover:shadow-lg"
        style={{ borderRadius: 999 }}
      >
        <SlidersIcon className={`h-5 w-5 transition ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div
          className="fixed bottom-20 right-5 z-[9999] w-[300px] overflow-hidden rounded-card border border-border bg-card shadow-lg fade-in"
          role="dialog"
          aria-label="个性化设置"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <SlidersIcon className="h-4 w-4 text-text-3" />
              <span className="text-sub font-semibold tracking-tight">个性化</span>
            </div>
            <button
              type="button"
              onClick={resetTweaks}
              className="text-chip text-text-3 transition hover:text-accent-ink"
            >
              重置
            </button>
          </header>

          <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
            <TweakSection label="主题" />
            <TweakColor
              label="主题色"
              value={tweaks.accent}
              onChange={(v) => setTweak("accent", v)}
            />

            <TweakSection label="密度与字号" />
            <TweakRadio<Density>
              label="信息密度"
              value={tweaks.density}
              options={[
                { value: "cozy", label: "紧凑" },
                { value: "standard", label: "标准" },
                { value: "comfortable", label: "宽松" }
              ]}
              onChange={(v) => setTweak("density", v)}
            />
            <TweakSlider
              label="卡片圆角"
              value={tweaks.radius}
              min={4}
              max={20}
              step={1}
              unit="px"
              onChange={(v) => setTweak("radius", v)}
            />
            <TweakSlider
              label="字号缩放"
              value={tweaks.fontScale}
              min={0.85}
              max={1.2}
              step={0.05}
              onChange={(v) => setTweak("fontScale", v)}
              format={(v) => `${Math.round(v * 100)}%`}
            />

            <TweakSection label="侧边栏" />
            <TweakToggle
              label="收起侧边栏"
              value={tweaks.sidebarCollapsed}
              onChange={(v) => setTweak("sidebarCollapsed", v)}
            />

            <TweakSection label="身份切换" />
            <TweakSelect<Role>
              label="当前身份"
              value={tweaks.role}
              options={[
                { value: "employee", label: "员工" },
                { value: "manager", label: "部门负责人" },
                { value: "admin", label: "管理员" }
              ]}
              onChange={(v) => setTweak("role", v)}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ─── 子组件 ───────────────────────────────────────────────────

function TweakSection({ label }: { label: string }) {
  return (
    <div className="mb-2 mt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3 first:mt-0">
      {label}
    </div>
  );
}

function TweakRow({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-cap text-text-2">{label}</span>
        {children}
      </div>
    </div>
  );
}

function TweakColor({
  label,
  value,
  onChange
}: {
  label: string;
  value: AccentKey;
  onChange: (v: AccentKey) => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-2 text-cap text-text-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ACCENT_PRESETS) as AccentKey[]).map((key) => {
          const preset = ACCENT_PRESETS[key];
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-label={key}
              className="relative h-7 w-7 rounded-md transition"
              style={{
                background: preset.accent,
                boxShadow: active
                  ? `0 0 0 2px var(--card), 0 0 0 4px ${preset.accent}`
                  : "0 1px 2px rgba(0,0,0,.06)"
              }}
            >
              {active && (
                <CheckIcon className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TweakRadio<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <TweakRow label={label}>
      <div className="seg-btns" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`seg-btn ${value === opt.value ? "active" : ""}`}
            role="radio"
            aria-checked={value === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  format
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const display = format ? format(value) : `${value}${unit ?? ""}`;
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-cap text-text-2">{label}</span>
        <span className="num text-chip text-text">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent"
        style={{ accentColor: "var(--accent)" }}
      />
    </div>
  );
}

function TweakToggle({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <TweakRow label={label}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${value ? "bg-accent" : "bg-bg-subtle"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-card transition ${value ? "translate-x-[18px]" : "translate-x-[2px]"}`}
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,.18)" }}
        />
      </button>
    </TweakRow>
  );
}

function TweakSelect<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <TweakRow label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-7 rounded-md border border-border bg-card px-2 text-cap text-text outline-none transition focus:border-accent"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </TweakRow>
  );
}

// ─── Icons ────────────────────────────────────────────────────

function SlidersIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="10" cy="6" r="2" fill="currentColor" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="16" cy="12" r="2" fill="currentColor" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="7" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}
