"use client";

// 图片放大 lightbox — 多图结果点击放大,backdrop + 居中 + Esc 关闭
// 多图时支持 ← → 切换;单图时不显示导航
// 视觉:rgba(15,18,28,.92) backdrop-blur,close 按钮右上角

import { useEffect } from "react";

export type LightboxImage = { url: string; alt?: string };

type Props = {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
};

export function Lightbox({ images, index, onClose, onIndexChange }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && images.length > 1) {
        onIndexChange((index - 1 + images.length) % images.length);
      }
      if (e.key === "ArrowRight" && images.length > 1) {
        onIndexChange((index + 1) % images.length);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [images.length, index, onClose, onIndexChange]);

  if (images.length === 0) return null;
  const safeIndex = ((index % images.length) + images.length) % images.length;
  const current = images[safeIndex];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50"
      style={{
        background: "rgba(15,18,28,.92)",
        backdropFilter: "blur(6px)",
        // 用 flex 替换 grid — grid 在某些浏览器里会让 <img> 被 stretch 成 cell 尺寸,
        // 哪怕 object-contain 也只在被拉伸后的 box 内 fit,导致看起来"图被拉成横长条"
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition"
      >
        <CloseIcon />
      </button>

      {images.length > 1 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-cap num">
          {safeIndex + 1} / {images.length}
        </div>
      )}

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onIndexChange((safeIndex - 1 + images.length) % images.length);
            }}
            aria-label="上一张"
            className="absolute left-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition"
          >
            <ChevronIcon dir="left" />
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onIndexChange((safeIndex + 1) % images.length);
            }}
            aria-label="下一张"
            className="absolute right-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition"
          >
            <ChevronIcon dir="right" />
          </button>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* 完全 inline style 排除 Tailwind / grid 干扰 — img 严格按自然比例,不被父容器 stretch */}
      <img
        src={current.url}
        alt={current.alt ?? ""}
        onClick={e => e.stopPropagation()}
        className="rounded-xl shadow-2xl"
        style={{
          maxWidth: "calc(100vw - 64px)",
          maxHeight: "calc(100vh - 64px)",
          width: "auto",
          height: "auto",
          objectFit: "contain",
          display: "block",
          flex: "0 0 auto"
        }}
      />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === "left" ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}
