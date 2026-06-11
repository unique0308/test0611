"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icons";

export interface TabItem<V extends string = string> {
  value: V;
  label: string;
  icon?: IconName;
  count?: number;
}

interface Props<V extends string = string> {
  value: V;
  onChange: (v: V) => void;
  items: TabItem<V>[];
  variant?: "pill" | "underline";
}

export function Tabs<V extends string = string>({
  value,
  onChange,
  items,
  variant = "pill"
}: Props<V>) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0
  });

  useEffect(() => {
    const el = refs.current[value];
    const container = containerRef.current;
    if (el && container) {
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      setIndicator({ left: eRect.left - cRect.left, width: eRect.width });
    }
  }, [value, items]);

  return (
    <div className={variant === "underline" ? "tabs-underline" : "tabs"} ref={containerRef}>
      <div className="tab-indicator" style={{ left: indicator.left, width: indicator.width }} />
      {items.map((it) => (
        <div
          key={it.value}
          ref={(e) => {
            refs.current[it.value] = e;
          }}
          className={`tab ${value === it.value ? "active" : ""}`}
          onClick={() => onChange(it.value)}
          role="tab"
          tabIndex={0}
          aria-selected={value === it.value}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(it.value);
            }
          }}
        >
          {it.icon && <Icon name={it.icon} size={14} />}
          <span>{it.label}</span>
          {it.count != null && <span className="count num">{it.count}</span>}
        </div>
      ))}
    </div>
  );
}
