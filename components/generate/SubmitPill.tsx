"use client";

// 生成提交胶囊 — ⚡剩余积分 + 圆形 ↑ 提交按钮,合成一个 pill。
// CollapsedDock 与 GenerationDock 共用,保证折叠/展开态提交区一致。
// size:md(展开态 param 行,h-10)/ lg(折叠输入条,h-12)。
// ⚠️ 内部是 type="submit" 按钮,必须渲染在 <form> 内(两个 dock 都是 form)。

type Props = {
  remainCredits: number;
  warning: "green" | "yellow" | "red";
  loading: boolean;
  disabled: boolean;
  className?: string;
  size?: "md" | "lg";
};

export function SubmitPill({
  remainCredits,
  warning,
  loading,
  disabled,
  className,
  size = "md"
}: Props) {
  // ⚡积分随部门配额预警染色:绿(正常)/ 黄 / 红
  const tone =
    warning === "red" ? "text-danger" : warning === "yellow" ? "text-warn" : "text-text-2";
  const lg = size === "lg";
  return (
    <div
      className={
        (lg ? "h-12 pl-4 pr-1.5 gap-2.5 " : "h-10 pl-3.5 pr-1 gap-2 ") +
        "inline-flex items-center rounded-full bg-card border border-border shadow-sm shrink-0 " +
        (className ?? "")
      }
    >
      <BoltIcon className={tone} size={lg ? 15 : 13} />
      <span
        className={"num font-medium " + (lg ? "text-body " : "text-sub ") + tone}
        title={`本部门剩余 ${remainCredits} 积分`}
      >
        {remainCredits}
      </span>
      {/* 竖线分隔 ⚡积分 与 圆形按钮 */}
      <span aria-hidden className={"w-px bg-border " + (lg ? "h-5" : "h-4")} />
      <button
        type="submit"
        disabled={disabled || loading}
        title="生成 ⌘↵"
        aria-label="生成"
        className={
          (lg ? "w-10 h-10 " : "w-8 h-8 ") +
          (disabled
            ? "bg-bg text-text-3 cursor-not-allowed "
            : "bg-primary text-white hover:bg-primary-ink shadow-sm ") +
          "rounded-full inline-flex items-center justify-center transition-all duration-200"
        }
      >
        {loading ? (
          <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <svg viewBox="0 0 24 24" width={lg ? 18 : 16} height={lg ? 18 : 16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        )}
      </button>
    </div>
  );
}

function BoltIcon({ className, size = 13 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className}>
      <path d="M11 21l9-12h-7l1-8L4 13h7l-1 8z" />
    </svg>
  );
}
