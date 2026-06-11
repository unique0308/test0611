"use client";

// 自定义下拉,替换 GenerationCard 里使用目的 / 数量 / 时长 的原生 <select>
// 视觉:`.param` 胶囊风格 — 34h / px-12 / 8r / border-strong / 白底,跟 param-bar 其他胶囊保持一致
// 行为:点击展开 menu / 点击外部关闭 / 键盘 Esc 关闭 / 选项 hover 主色软底
//
// ⚠️ menu 用 createPortal 渲染到 body,绕开父级 GenerationDock 的 overflow-hidden 截断
// menu 位置:fixed 定位,自动检测视口空间,空间不够时向上展开

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ParamOption<T> = {
  value: T;
  label: string;
  // 选中后展示的简短文本(默认 = label,但选项菜单里可能想显示更多)
  display?: string;
  // 右侧附加标签(例如使用目的的"自定义")
  badge?: string;
};

type Props<T extends string | number> = {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  value: T;
  options: ParamOption<T>[];
  onChange: (v: T) => void;
  // 在选项菜单底部固定渲染额外内容(例如使用目的的"+ 新增"按钮)
  footer?: React.ReactNode;
  // 控制 menu 最大高度,长列表时可滚
  menuMaxHeight?: number;
  // 选中文字最大宽,触发省略号(避免参数栏被撑爆)
  valueMaxWidth?: number;
  // 撑满父容器宽度(用于表单字段,而非紧凑参数栏)
  fullWidth?: boolean;
  // 025 · M5 P1 波 3 D16 DM5.9:override = 视觉提示"本次覆盖"(单次选了 ≠ 主标签)
  // 边框 warn 色 + 软底 + 前缀 ⚡ icon 让员工眼见为实"这是临时的"
  accent?: "default" | "override";
};

type MenuPos = {
  top: number;
  left: number;
  minWidth: number;
  // openUp = true 时 top 是 menu 顶端,要计算成 button 上方
  openUp: boolean;
};

const MENU_GAP = 4;
const MENU_HEIGHT_EST = 280;
const MIN_MENU_WIDTH = 180;

export function ParamSelect<T extends string | number>({
  label,
  required,
  icon,
  value,
  options,
  onChange,
  footer,
  menuMaxHeight = 280,
  valueMaxWidth = 160,
  fullWidth = false,
  accent = "default"
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const current = options.find(o => o.value === value);

  // 点外 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 计算 menu 位置(open / resize / scroll 触发重算)
  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    function compute() {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const openUp = spaceBelow < MENU_HEIGHT_EST && spaceAbove > spaceBelow;
      setMenuPos({
        top: openUp ? r.top - MENU_GAP : r.bottom + MENU_GAP,
        left: r.left,
        minWidth: Math.max(r.width, MIN_MENU_WIDTH),
        openUp
      });
    }
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={
          "h-10 px-3.5 rounded-md border flex items-center gap-2 text-body transition " +
          (fullWidth ? "w-full " : "") +
          // 025 · M5 P1 波 3:override 态走 warn 配色让员工眼见为实"这是单次覆盖"
          (accent === "override"
            ? (open ? "border-warn bg-warn-soft text-warn" : "border-warn bg-warn-soft text-warn hover:border-warn")
            : "bg-card " + (open ? "border-primary text-text" : "border-border-strong text-text hover:border-text-3"))
        }
        title={accent === "override" ? "本次覆盖(不改主标签)" : undefined}
      >
        {accent === "override" && <span aria-hidden className="text-warn">⚡</span>}
        {icon && <span className={accent === "override" ? "text-warn inline-flex" : "text-text-3 inline-flex"}>{icon}</span>}
        {label && (
          <span className={accent === "override" ? "text-warn" : "text-text-3"}>
            {required && <span className="text-danger mr-0.5">*</span>}
            {label}
          </span>
        )}
        <span
          className={"font-medium truncate " + (fullWidth ? "flex-1 text-left" : "")}
          style={fullWidth ? undefined : { maxWidth: valueMaxWidth }}
          title={current?.display ?? current?.label}
        >
          {current?.display ?? current?.label ?? "—"}
        </span>
        <Chevron open={open} />
      </button>

      {open && menuPos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[60] bg-card border border-border rounded-lg shadow-md py-1 animate-zoom-in"
            style={{
              top: menuPos.openUp ? "auto" : menuPos.top,
              bottom: menuPos.openUp ? window.innerHeight - menuPos.top : "auto",
              left: menuPos.left,
              minWidth: menuPos.minWidth,
              maxHeight: menuMaxHeight + 60,
              transformOrigin: menuPos.openUp ? "bottom" : "top"
            }}
          >
            <ul className="overflow-y-auto" style={{ maxHeight: menuMaxHeight }}>
              {options.map(o => {
                const active = o.value === value;
                return (
                  <li key={String(o.value)}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={
                        "w-full flex items-center justify-between gap-3 px-3 py-1.5 text-body text-left transition " +
                        (active
                          ? "bg-primary-soft text-primary"
                          : "text-text hover:bg-bg")
                      }
                    >
                      <span className="truncate">{o.label}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {o.badge && (
                          <span className="text-cap text-text-3 px-1.5 py-0.5 rounded bg-bg">
                            {o.badge}
                          </span>
                        )}
                        {active && <CheckIcon />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {footer && (
              <div className="border-t border-border mt-1 pt-1 px-1.5 pb-1">{footer}</div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={"text-text-3 transition-transform " + (open ? "rotate-180" : "")}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}
