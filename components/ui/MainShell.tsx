"use client";

import type { ReactNode } from "react";
import { useDensityClass } from "@/lib/tweaks";

// 客户端 wrapper：把 useTweaks 的 density 类应用到 .app-shell，
// 这样 layout 本身保持 server component（保留 requireAuth / getSignedUrl 等异步逻辑）。
//
// 2026-05-29 V1 加 B(设计参考 §3.1):.app-shell 改 3 列 grid:
//   主 sidebar(64) + ConversationsPanel(280,可整栏收起) + main
// MainShell 接 convPanel 作为新 prop(放第 2 列);未传时仅渲染 sidebar+main(/auth 等无 conv 的路由用)

interface Props {
  sidebar: ReactNode;
  convPanel?: ReactNode;
  children: ReactNode;
}

export function MainShell({ sidebar, convPanel, children }: Props) {
  const densityClass = useDensityClass();
  return (
    <div className={`app-shell ${densityClass}`}>
      {sidebar}
      {convPanel}
      <main className="main">{children}</main>
    </div>
  );
}
