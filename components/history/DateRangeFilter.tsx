"use client";

import { useEffect, useRef, useState } from "react";

// 资产页「时间」筛选(2026-05-22)
// 预设区间 + 自定义日历选择(原生 date input);输出 ISO 起止给 /api/tasks

type Props = {
  onChange: (from: string, to: string) => void;
};

type PresetKey = "all" | "7d" | "30d" | "month" | "quarter";

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: "all", label: "全部时间" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "month", label: "本月" },
  { key: "quarter", label: "本季度" }
];

function startOfDayIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
}

function presetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  if (key === "all") return { from: "", to: "" };
  if (key === "7d") return { from: startOfDayIso(new Date(now.getTime() - 6 * 86400_000)), to: "" };
  if (key === "30d") return { from: startOfDayIso(new Date(now.getTime() - 29 * 86400_000)), to: "" };
  if (key === "month") return { from: startOfDayIso(new Date(now.getFullYear(), now.getMonth(), 1)), to: "" };
  // quarter
  const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
  return { from: startOfDayIso(new Date(now.getFullYear(), qStartMonth, 1)), to: "" };
}

// ISO → "M/D"
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function DateRangeFilter({ onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [presetKey, setPresetKey] = useState<PresetKey | "custom">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // 自定义草稿(YYYY-MM-DD)
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function applyPreset(key: PresetKey) {
    const r = presetRange(key);
    setPresetKey(key);
    setFrom(r.from);
    setTo(r.to);
    onChange(r.from, r.to);
    setOpen(false);
  }

  function applyCustom() {
    if (!draftFrom && !draftTo) return;
    const f = draftFrom ? new Date(`${draftFrom}T00:00:00`).toISOString() : "";
    const t = draftTo ? new Date(`${draftTo}T23:59:59`).toISOString() : "";
    setPresetKey("custom");
    setFrom(f);
    setTo(t);
    onChange(f, t);
    setOpen(false);
  }

  const label =
    presetKey !== "custom"
      ? PRESETS.find(p => p.key === presetKey)?.label ?? "时间"
      : from && to
        ? `${shortDate(from)} – ${shortDate(to)}`
        : from
          ? `${shortDate(from)} 起`
          : to
            ? `至 ${shortDate(to)}`
            : "自定义";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={
          "h-10 px-3.5 rounded-md border bg-card inline-flex items-center gap-2 text-body transition " +
          (presetKey !== "all" && (from || to)
            ? "border-primary/40 text-primary"
            : "border-border-strong text-text-2 hover:border-primary")
        }
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 2.5v4M16 2.5v4" />
        </svg>
        <span className="text-text-3">时间</span>
        <span className="font-medium">{label}</span>
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={"text-text-3 transition-transform " + (open ? "rotate-180" : "")}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-[260px] rounded-lg border border-border bg-card shadow-md p-2 animate-zoom-in">
          {/* 预设 */}
          <div className="flex flex-col">
            {PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={
                  "w-full text-left px-2.5 py-1.5 rounded text-sub transition " +
                  (presetKey === p.key
                    ? "bg-primary-soft text-primary font-medium"
                    : "text-text hover:bg-bg")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* 自定义日历区间 */}
          <div className="mt-1.5 pt-2 border-t border-border">
            <div className="text-chip text-text-3 mb-1.5 px-0.5">自定义区间</div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={e => setDraftFrom(e.target.value)}
                className="flex-1 min-w-0 h-8 px-2 rounded border border-border-strong bg-card text-chip text-text outline-none focus:border-primary"
              />
              <span className="text-text-3 text-chip">至</span>
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={e => setDraftTo(e.target.value)}
                className="flex-1 min-w-0 h-8 px-2 rounded border border-border-strong bg-card text-chip text-text outline-none focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!draftFrom && !draftTo}
              className="w-full h-8 mt-2 rounded-md bg-primary text-white text-small font-medium hover:bg-primary-ink transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              应用
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
