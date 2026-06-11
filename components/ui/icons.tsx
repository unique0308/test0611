// 共享 SVG 图标库 — 来源：原型设计V2/_extract/src/icons.jsx
// stroke-only 风格，1.6px 描边，24×24 viewBox，currentColor 上色。
// 使用：<Icon name="sparkle" size={18} className="opacity-80" />

import type { CSSProperties, ReactNode } from "react";

export type IconName =
  | "sparkle"
  | "image"
  | "video"
  | "folder"
  | "receipt"
  | "chart"
  | "shield"
  | "building"
  | "user"
  | "chev"
  | "chevDown"
  | "chevLeft"
  | "collapse"
  | "expand"
  | "search"
  | "cmd"
  | "plus"
  | "star"
  | "starFill"
  | "download"
  | "refresh"
  | "eye"
  | "more"
  | "filter"
  | "calendar"
  | "upload"
  | "arrow"
  | "arrowUp"
  | "arrowDown"
  | "check"
  | "x"
  | "alert"
  | "info"
  | "bell"
  | "history"
  | "layers"
  | "send"
  | "zap"
  | "drop"
  | "link"
  | "logout"
  | "swap"
  | "trend"
  | "spark"
  | "grid"
  | "list"
  | "cog"
  | "tag"
  | "bolt"
  | "scan";

const ICONS: Record<IconName, ReactNode> = {
  sparkle: (
    <>
      <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8L16.5 18.5l1.8-.7z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9.5" r="1.8" />
      <path d="M21 16l-5.5-5.5L4 20" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2" />
      <path d="M15.5 10l5-3v10l-5-3z" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
  receipt: (
    <>
      <path d="M5 3h12a1 1 0 011 1v17l-3-2-3 2-3-2-3 2-2-1.5V4a1 1 0 011-1z" />
      <path d="M8 8h7M8 12h7M8 16h4" />
    </>
  ),
  chart: (
    <>
      <path d="M3 20h18" />
      <path d="M6 16V10M11 16V6M16 16v-4M21 16v-9" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3 8.5-8 9-5-.5-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </>
  ),
  chev: <path d="M9 6l6 6-6 6" />,
  chevDown: <path d="M6 9l6 6 6-6" />,
  chevLeft: <path d="M15 6l-6 6 6 6" />,
  collapse: (
    <>
      <path d="M11 6l-5 6 5 6" />
      <path d="M18 6l-5 6 5 6" />
    </>
  ),
  expand: (
    <>
      <path d="M13 6l5 6-5 6" />
      <path d="M6 6l5 6-5 6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  cmd: <path d="M9 6a3 3 0 11-3 3h12a3 3 0 11-3-3v12a3 3 0 113-3H6a3 3 0 113 3z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="M12 3l2.6 5.7 6.4.7-4.8 4.4 1.4 6.2L12 17l-5.6 3 1.4-6.2L3 9.4l6.4-.7z" />,
  starFill: (
    <path
      d="M12 3l2.6 5.7 6.4.7-4.8 4.4 1.4 6.2L12 17l-5.6 3 1.4-6.2L3 9.4l6.4-.7z"
      fill="currentColor"
      stroke="none"
    />
  ),
  download: (
    <>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0114-5.3M20 4v4h-4" />
      <path d="M20 12a8 8 0 01-14 5.3M4 20v-4h4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="18" cy="12" r="1" fill="currentColor" />
    </>
  ),
  filter: <path d="M3 5h18l-7 9v6l-4-2v-4z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 17V5M7 10l5-5 5 5" />
      <path d="M5 20h14" />
    </>
  ),
  arrow: <path d="M5 12h14M13 5l7 7-7 7" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowDown: <path d="M12 5v14M5 12l7 7 7-7" />,
  check: <path d="M5 12l4 4 10-10" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  alert: (
    <>
      <path d="M12 3L2 20h20L12 3z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 17V11a6 6 0 0112 0v6" />
      <path d="M4 17h16M10 21h4" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </>
  ),
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  zap: <path d="M13 3L5 14h6l-1 7 8-11h-6z" fill="currentColor" stroke="none" />,
  drop: <path d="M12 3s7 7 7 12a7 7 0 11-14 0c0-5 7-12 7-12z" />,
  link: (
    <>
      <path d="M10 13a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66L11 6.34" />
      <path d="M14 11a4 4 0 00-5.66 0l-3 3a4 4 0 105.66 5.66L13 17.66" />
    </>
  ),
  logout: (
    <>
      <path d="M14 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7a2 2 0 002-2v-2" />
      <path d="M9 12h12M17 8l4 4-4 4" />
    </>
  ),
  swap: (
    <>
      <path d="M7 16h14M17 12l4 4-4 4" />
      <path d="M17 8H3M7 4L3 8l4 4" />
    </>
  ),
  trend: <path d="M3 17l6-6 4 4 8-8M21 7v6h-6" />,
  spark: <path d="M3 15l5-7 4 5 4-9 5 12" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </>
  ),
  list: <path d="M4 6h16M4 12h16M4 18h16" />,
  cog: (
    <>
      <path d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  // scan-frame：四角 + 中心圆点（AI 洞察"扫描识别"语义）
  scan: (
    <>
      <path d="M4 8V6a2 2 0 012-2h2" />
      <path d="M16 4h2a2 2 0 012 2v2" />
      <path d="M20 16v2a2 2 0 01-2 2h-2" />
      <path d="M8 20H6a2 2 0 01-2-2v-2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </>
  )
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 16, className = "", style }: IconProps) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
