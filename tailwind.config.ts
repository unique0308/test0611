import type { Config } from "tailwindcss";

// 设计 token 全部走 CSS 变量（定义在 app/globals.css :root）
// 这样 lib/tweaks 切换主色/圆角/字号时，所有 utility 类自动跟随
// 业务代码禁止硬编码十六进制色值，统一走这里的 theme extension
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "var(--bg)",
          subtle: "var(--bg-subtle)"
        },
        card: {
          DEFAULT: "var(--card)",
          elev: "var(--card-elev)"
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)"
        },
        text: {
          DEFAULT: "var(--text)",
          2: "var(--text-2)",
          3: "var(--text-3)",
          4: "var(--text-4)"
        },
        placeholder: "var(--placeholder)",
        // 主色（运行时可切：indigo/blue/violet/green/orange）
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
          ink: "var(--accent-ink)",
          2: "var(--accent-2)"
        },
        // primary 作为 accent 的别名，方便已有组件平滑过渡
        primary: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
          ink: "var(--accent-ink)"
        },
        violet: {
          DEFAULT: "var(--violet)",
          soft: "var(--violet-soft)"
        },
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-soft)"
        },
        warn: {
          DEFAULT: "var(--warn)",
          soft: "var(--warn-soft)"
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)"
        },
        // 图表系列
        s1: "var(--s1)",
        s2: "var(--s2)",
        s3: "var(--s3)",
        s4: "var(--s4)",
        s5: "var(--s5)"
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
        num: ["var(--font-mono)"]
      },
      borderRadius: {
        sm: "var(--r-sm)",
        DEFAULT: "var(--r-md)",
        md: "var(--r-md)",
        card: "var(--r-card)",
        lg: "14px",
        xl: "16px",
        pill: "var(--r-pill)"
      },
      boxShadow: {
        sm: "var(--sh-sm)",
        md: "var(--sh-md)",
        lg: "var(--sh-lg)",
        dock: "var(--sh-dock)",
        "dock-focus": "var(--sh-dock-focus)",
        accent: "var(--accent-shadow)",
        primary: "var(--accent-shadow)",
        violet: "0 8px 18px rgba(139,92,246,.25)"
      },
      maxWidth: {
        content: "1280px",
        "content-admin": "1320px",
        page: "1320px"
      },
      spacing: {
        sidebar: "var(--sidebar-w)",
        "sidebar-collapsed": "64px",
        appbar: "56px"
      },
      fontSize: {
        h1: ["22px", { lineHeight: "30px", fontWeight: "600" }],
        h2: ["17px", { lineHeight: "24px", fontWeight: "600" }],
        kpi: ["26px", { lineHeight: "32px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "22px" }],
        sub: ["13px", { lineHeight: "20px" }],
        cap: ["12.5px", { lineHeight: "18px", fontWeight: "500" }],
        small: ["12px", { lineHeight: "16px", fontWeight: "500" }],
        chip: ["11.5px", { lineHeight: "16px", fontWeight: "500" }]
      }
    }
  },
  plugins: []
};

export default config;
