"use client";

// 通用参数弹层 — param 栏的胶囊按钮,点击在按钮上方/下方弹出自定义内容面板。
// 用于:模型选择(列表)、比例&数量(图片)、比例&时长(视频)。
// 机制同 ParamSelect:createPortal 到 body 绕开 dock 的 overflow-hidden;fixed 定位 + 自动 openUp;
// 点外部 / Esc 关闭。children 收到 close(),供"单选即收起"的场景(如模型)主动关闭。

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  // 胶囊按钮里显示的摘要内容(模型名 / 比例摘要 等)
  trigger: React.ReactNode;
  // 弹层面板内容;close 供选中后主动收起
  children: (close: () => void) => React.ReactNode;
  disabled?: boolean;
  panelWidth?: number;
  ariaLabel?: string;
};

const GAP = 6;
const PANEL_EST = 320; // 估算面板高度,用于判断向上还是向下展开

export function PopoverParam({ trigger, children, disabled, panelWidth = 320, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // 点外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 计算面板位置(open / resize / scroll 触发重算)
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function compute() {
      const b = btnRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const above = r.top;
      const openUp = below < PANEL_EST && above > below;
      // 左对齐按钮;若右侧溢出则改成右对齐按钮右边缘
      let left = r.left;
      if (left + panelWidth > window.innerWidth - 12) left = r.right - panelWidth;
      if (left < 12) left = 12;
      setPos({ left, top: openUp ? r.top - GAP : r.bottom + GAP, openUp });
    }
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, panelWidth]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={
          "h-10 px-3.5 rounded-md border bg-card flex items-center gap-2 text-body transition disabled:opacity-50 " +
          (open ? "border-primary text-text" : "border-border-strong text-text hover:border-text-3")
        }
      >
        {trigger}
        <Chevron open={open} />
      </button>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[60] bg-card border border-border rounded-xl shadow-md animate-zoom-in"
            style={{
              left: pos.left,
              top: pos.openUp ? "auto" : pos.top,
              bottom: pos.openUp ? window.innerHeight - pos.top : "auto",
              width: panelWidth,
              transformOrigin: pos.openUp ? "bottom" : "top"
            }}
          >
            {children(() => setOpen(false))}
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
