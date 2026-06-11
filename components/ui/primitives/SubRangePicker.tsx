"use client";

import { useEffect, useRef, useState } from "react";
import {
  rangeLabel,
  rangePrimary,
  subRanges,
  type TrendRange
} from "./trend-range";

// 子选项选择器：放在 section-head 左侧 hint 区
// 当前 primary 是按日/按月 时，hint 文案可点击打开 popover 切换
// 季度/年 时，hint 退化为纯文本（无可点）

interface Props {
  value: TrendRange;
  onChange: (v: TrendRange) => void;
}

export function SubRangePicker({ value, onChange }: Props) {
  const primary = rangePrimary(value);
  const options = subRanges(primary);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点外关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 无 sub → 纯文本
  if (options.length === 0) {
    return (
      <span
        className="t-cap"
        style={{
          marginLeft: 6,
          textTransform: "none",
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 400
        }}
      >
        · {rangeLabel(value)}
      </span>
    );
  }

  return (
    <span
      ref={ref}
      style={{ marginLeft: 6, position: "relative", display: "inline-flex", alignItems: "center" }}
    >
      <span style={{ color: "var(--text-3)", fontSize: 11, marginRight: 2 }}>·</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          padding: "1px 4px",
          fontSize: 11,
          color: "var(--text-2)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          borderRadius: 4,
          fontWeight: 400
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-subtle)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {rangeLabel(value)}
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ opacity: 0.5, transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 6,
            zIndex: 50,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--sh-md)",
            padding: 4,
            minWidth: 92,
            animation: "fade-in .14s ease"
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              role="option"
              aria-selected={value === opt.value}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                fontSize: 12,
                border: "none",
                background: value === opt.value ? "var(--accent-soft)" : "transparent",
                color: value === opt.value ? "var(--accent-ink)" : "var(--text-2)",
                cursor: "pointer",
                borderRadius: 6,
                fontWeight: value === opt.value ? 600 : 400
              }}
              onMouseEnter={(e) => {
                if (value !== opt.value) e.currentTarget.style.background = "var(--bg-subtle)";
              }}
              onMouseLeave={(e) => {
                if (value !== opt.value) e.currentTarget.style.background = "transparent";
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
