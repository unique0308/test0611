"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/icons";

export interface LightboxSource {
  /** 真实图片地址；若提供则展示图，否则展示双色渐变占位 */
  url?: string;
  c1?: string;
  c2?: string;
  alt?: string;
}

interface Props {
  src: LightboxSource | null;
  onClose: () => void;
}

export function Lightbox({ src, onClose }: Props) {
  useEffect(() => {
    if (!src) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [src, onClose]);

  if (!src) return null;

  const content = src.url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src.url}
      alt={src.alt ?? ""}
      style={{
        width: "min(80vw, 820px)",
        maxHeight: "80vh",
        objectFit: "contain",
        borderRadius: 16,
        boxShadow: "0 24px 60px rgba(0,0,0,.4)"
      }}
    />
  ) : (
    <div
      className="img-ph"
      style={{
        width: "min(80vw, 720px)",
        aspectRatio: "1 / 1",
        borderRadius: 16,
        background: `linear-gradient(135deg, ${src.c1 ?? "#a78bfa"}, ${src.c2 ?? "#ec4899"})`,
        boxShadow: "0 24px 60px rgba(0,0,0,.4)",
        position: "relative"
      }}
    />
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        background: "rgba(10,10,12,.78)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        animation: "fade-in .15s"
      }}
      role="dialog"
      aria-modal="true"
    >
      {content}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        style={{
          position: "fixed",
          top: 24,
          right: 24,
          width: 36,
          height: 36,
          borderRadius: 10,
          border: "none",
          background: "rgba(255,255,255,.1)",
          color: "#fff",
          cursor: "pointer",
          backdropFilter: "blur(8px)"
        }}
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
