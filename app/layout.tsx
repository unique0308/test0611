import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { TweaksProvider } from "@/lib/tweaks";
import "./globals.css";

// next/font 在 build 时把字体抓到本地，运行时不再请求 Google；
// preload + display swap + 自动 fallback metric 调整，保证国内/无网时 UI 不掉档
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial"],
  adjustFontFallback: true
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-inter-tight",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial"],
  adjustFontFallback: true
});

// V2 设计指定 Geist Mono；当前 next/font 未导出，用 JetBrains Mono 等价替代（V2 fallback 链含它）
const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"]
});

export const metadata: Metadata = {
  title: "AI 中台",
  description: "公司内部 AI 图像/视频生成统一入口"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${interTight.variable} ${monoFont.variable}`}
    >
      <body>
        <TweaksProvider>{children}</TweaksProvider>
      </body>
    </html>
  );
}
