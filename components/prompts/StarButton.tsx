"use client";

import { useState } from "react";

// V1.1 ⭐ 收藏按钮(历史行 / 收藏卡 / 结果页 复用)
// 乐观更新 + 失败回退;422 = 200 条上限,前端 alert 提示清理
// 视觉:用 theme `warn` / `warn-soft`(CLAUDE.md §5.1 不硬编码色值)

type Size = "sm" | "md";

type Props = {
  taskId: string;
  collectionId: number | null;
  onChange?: (newId: number | null) => void;
  size?: Size;
  className?: string;
};

export function StarButton({ taskId, collectionId, onChange, size = "sm", className = "" }: Props) {
  const [localId, setLocalId] = useState<number | null>(collectionId);
  const [pending, setPending] = useState(false);
  const collected = localId !== null;

  // 不用动态类名拼接(Tailwind JIT 需要完整字面量),用条件 className
  const sizeClasses = size === "md" ? "w-8 h-8" : "w-7 h-7";
  const icon = size === "md" ? 22 : 18;

  function commit(newId: number | null) {
    setLocalId(newId);
    onChange?.(newId);
  }

  async function toggle() {
    if (pending) return;
    setPending(true);
    const prev = localId;
    commit(collected ? null : -1); // 乐观:占位 -1
    try {
      if (collected) {
        const res = await fetch(`/api/prompts/collect/${prev}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        commit(null);
      } else {
        const res = await fetch("/api/prompts/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: taskId })
        });
        if (!res.ok) {
          if (res.status === 422) {
            // 200 条上限:Q-V1-01 决定
            alert("已达到 200 条收藏上限,请到 Prompt 收藏页清理后再收藏");
          }
          throw new Error(`status ${res.status}`);
        }
        const row = (await res.json()) as { id: number };
        commit(row.id);
      }
    } catch {
      commit(prev);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={collected ? "取消收藏" : "收藏 Prompt"}
      aria-label={collected ? "取消收藏" : "收藏 Prompt"}
      className={
        `inline-flex items-center justify-center ${sizeClasses} rounded transition ` +
        (collected ? "text-warn hover:bg-warn-soft" : "text-text-3 hover:text-warn hover:bg-warn-soft") +
        (pending ? " opacity-50 cursor-wait" : " cursor-pointer") +
        " " + className
      }
    >
      <svg
        viewBox="0 0 24 24"
        width={icon}
        height={icon}
        fill={collected ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={collected ? 0 : 1.6}
      >
        <path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.6l-5.88 3.01 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
