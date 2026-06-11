"use client";

// V1 加 B(2026-05-29 设计参考 §3.1):对话历史栏 ConversationsPanel
// 独立侧栏(MainShell 第 2 列),展示当前 user 的全部 conversations + 新建/重命名/置顶/删除
// "默认创作"系统会话不可删/不可改名/不可置顶 — UI 层 + API 层双重保护
//
// 边界:本组件**不是会话内 feed 视图**。Feed 在 GenerateCore 里按 conversation_id query 拉。
// 本组件职责:列表 + CRUD + 路由切换(push `/?conversation_id=xxx&kind=image|video`)

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type ConvPanelItem = {
  id: string;
  name: string;
  is_default: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
  cover_url: string | null;
};

type Props = { initialConversations: ConvPanelItem[] };

export function ConversationsPanel({ initialConversations }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const search = searchParams ?? new URLSearchParams();

  // 当前 `/?conversation_id=xxx` 才高亮(其它路由不高亮任何条目)
  const isGeneratePage = pathname === "/";
  const activeId = isGeneratePage ? search.get("conversation_id") : null;
  // 切回时保留 image/video tab(默认 image)
  const currentKind = (search.get("kind") === "video" ? "video" : "image") as "image" | "video";

  const [conversations, setConversations] = useState<ConvPanelItem[]>(initialConversations);
  const [collapsed, setCollapsed] = useState(false);

  // V1 加 B(2026-05-29):router.push 触发 SSR 重跑,layout 拉新 conversations,Panel 同步
  // 当 listUserConversations 过滤掉无 task 的 conv 后,这里要跟随 server filter 更新
  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);
  const [creating, setCreating] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // 收起状态本地持久 + CSS 变量联动
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("convpanel:collapsed");
      if (saved === "1") setCollapsed(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("convpanel:collapsed", collapsed ? "1" : "0");
    } catch {}
    // 生成页 feed 容器已 hard padding pt-14(56px),胶囊 14-46 不挡日期;此处只控 convpanel-w
    document.documentElement.style.setProperty(
      "--convpanel-w",
      !isGeneratePage || collapsed ? "0px" : "280px"
    );
  }, [collapsed, isGeneratePage]);

  // 关 menu / rename / confirmDelete on outside click
  useEffect(() => {
    if (menuOpenId === null && renameId === null && confirmDeleteId === null) return;
    function onDoc(e: MouseEvent) {
      if (!menuContainerRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!menuContainerRef.current.contains(e.target)) {
        setMenuOpenId(null);
        setRenameId(null);
        setConfirmDeleteId(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpenId, renameId, confirmDeleteId]);

  // 分组:置顶在前,非置顶按 updated_at 倒序(API 已排好,这里只过滤)
  // 默认创作永远在"最近"末尾(updated_at 排序自然落底,但若历史 task 多则可能不在底)
  // 简化:默认创作单独永远在最后 — 用户的"主力收纳箱"应当稳定在底部
  const pinned = conversations.filter((c) => !c.is_default && c.pinned_at);
  const nonPinnedNonDefault = conversations.filter((c) => !c.is_default && !c.pinned_at);
  const defaultConv = conversations.find((c) => c.is_default);

  async function handleNewConversation() {
    if (creating) return;
    setCreating(true);
    try {
      const r = await fetch("/api/conversations", { method: "POST" });
      if (!r.ok) return;
      const data = (await r.json()) as { conversation: ConvPanelItem };
      // V1 加 B(2026-05-29):不再立刻 setConversations 把空 conv 加进列表
      // 该 conv 在 listUserConversations 里被 filter 掉(无 task),
      // 等用户提交首条 task 后,bump 完成 → 下次 router.push 触发 SSR → useEffect 同步出现
      router.push(`/?conversation_id=${data.conversation.id}&kind=${currentKind}`);
    } finally {
      setCreating(false);
    }
  }

  async function handlePin(id: string, pinned: boolean) {
    const r = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned })
    });
    if (!r.ok) return;
    const { conversation } = (await r.json()) as { conversation: ConvPanelItem };
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned_at: conversation.pinned_at, updated_at: conversation.updated_at } : c))
    );
    setMenuOpenId(null);
  }

  async function handleRenameSubmit(id: string) {
    const name = renameValue.trim();
    if (!name) {
      setRenameId(null);
      return;
    }
    const r = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (r.ok) {
      const { conversation } = (await r.json()) as { conversation: ConvPanelItem };
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name: conversation.name, updated_at: conversation.updated_at } : c))
      );
    }
    setRenameId(null);
  }

  async function handleDelete(id: string) {
    const r = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!r.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setConfirmDeleteId(null);
    setMenuOpenId(null);
    // 删除的是当前 active → 切回默认创作
    if (activeId === id) {
      const def = conversations.find((c) => c.is_default);
      router.push(def ? `/?conversation_id=${def.id}&kind=${currentKind}` : "/");
    }
  }

  // 非生成页:整栏隐藏 — 返回 grid 占位 div(0 宽 cell,main 仍落第 3 列),不渲染胶囊
  if (!isGeneratePage) {
    return <div aria-hidden style={{ visibility: "hidden" }} />;
  }

  if (collapsed) {
    // 收起态:返回 fragment(占位 div + fixed pill)
    // 占位 div 必需 — 让 MainShell .app-shell grid 第 2 列保留 cell(width 0),
    // 否则 main 会被 auto-placement 算法放到第 2 列(--convpanel-w=0)导致内容挤死
    const activeConv = activeId ? conversations.find((c) => c.id === activeId) : null;
    const activeName =
      activeConv?.name?.trim() ||
      (activeConv?.is_default ? "默认创作" : activeConv ? "未命名对话" : "对话历史");
    return (
      <>
        <div aria-hidden style={{ visibility: "hidden" }} />
        <div
          className="conv-panel-collapsed-pill"
          style={{
            position: "fixed",
            left: "calc(var(--sidebar-w) + 8px)",
            top: 14,
            zIndex: 30
          }}
        >
          <span className="conv-pill-name" title={activeName}>
            {activeName}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="展开"
            aria-label="展开对话历史"
            className="conv-pill-toggle"
          >
            <PanelToggleIcon />
          </button>
        </div>
      </>
    );
  }

  return (
    <aside className="conv-panel" ref={menuContainerRef}>
      <div className="conv-panel-header">
        <span className="conv-panel-title">开启创作</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="conv-panel-toggle"
          title="收起对话历史"
          aria-label="收起对话历史"
        >
          <PanelToggleIcon />
        </button>
      </div>

      <button
        type="button"
        className="conv-new-btn"
        onClick={handleNewConversation}
        disabled={creating}
      >
        <PencilSquareIcon />
        <span>新对话</span>
      </button>

      <div className="conv-list">
        {pinned.length > 0 && (
          <>
            <div className="conv-section-label">置顶</div>
            {pinned.map((c) => (
              <ConvItem
                key={c.id}
                conv={c}
                isActive={c.id === activeId}
                kind={currentKind}
                isMenuOpen={menuOpenId === c.id}
                isRenaming={renameId === c.id}
                isConfirmingDelete={confirmDeleteId === c.id}
                renameValue={renameValue}
                onMenuToggle={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
                onStartRename={() => {
                  setRenameId(c.id);
                  setRenameValue(c.name);
                  setMenuOpenId(null);
                }}
                onRenameChange={setRenameValue}
                onRenameSubmit={() => handleRenameSubmit(c.id)}
                onRenameCancel={() => setRenameId(null)}
                onPin={() => handlePin(c.id, !c.pinned_at)}
                onStartDelete={() => {
                  setConfirmDeleteId(c.id);
                  setMenuOpenId(null);
                }}
                onConfirmDelete={() => handleDelete(c.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
              />
            ))}
          </>
        )}

        {(nonPinnedNonDefault.length > 0 || defaultConv) && (
          <>
            <div className="conv-section-label">最近</div>
            {nonPinnedNonDefault.map((c) => (
              <ConvItem
                key={c.id}
                conv={c}
                isActive={c.id === activeId}
                kind={currentKind}
                isMenuOpen={menuOpenId === c.id}
                isRenaming={renameId === c.id}
                isConfirmingDelete={confirmDeleteId === c.id}
                renameValue={renameValue}
                onMenuToggle={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
                onStartRename={() => {
                  setRenameId(c.id);
                  setRenameValue(c.name);
                  setMenuOpenId(null);
                }}
                onRenameChange={setRenameValue}
                onRenameSubmit={() => handleRenameSubmit(c.id)}
                onRenameCancel={() => setRenameId(null)}
                onPin={() => handlePin(c.id, !c.pinned_at)}
                onStartDelete={() => {
                  setConfirmDeleteId(c.id);
                  setMenuOpenId(null);
                }}
                onConfirmDelete={() => handleDelete(c.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
              />
            ))}
            {defaultConv && (
              <ConvItem
                key={defaultConv.id}
                conv={defaultConv}
                isActive={defaultConv.id === activeId}
                kind={currentKind}
                isMenuOpen={false}
                isRenaming={false}
                isConfirmingDelete={false}
                renameValue=""
                onMenuToggle={() => {}}
                onStartRename={() => {}}
                onRenameChange={() => {}}
                onRenameSubmit={() => {}}
                onRenameCancel={() => {}}
                onPin={() => {}}
                onStartDelete={() => {}}
                onConfirmDelete={() => {}}
                onCancelDelete={() => {}}
              />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// ─── ConvItem ───────────────────────────────────────────────────────

type ItemProps = {
  conv: ConvPanelItem;
  isActive: boolean;
  kind: "image" | "video";
  isMenuOpen: boolean;
  isRenaming: boolean;
  isConfirmingDelete: boolean;
  renameValue: string;
  onMenuToggle: () => void;
  onStartRename: () => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onPin: () => void;
  onStartDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

function ConvItem(p: ItemProps) {
  const router = useRouter();
  const { conv } = p;
  const displayName = conv.name || "未命名对话";
  const isNamed = !!conv.name;

  function onItemClick() {
    if (p.isRenaming || p.isConfirmingDelete) return;
    router.push(`/?conversation_id=${conv.id}&kind=${p.kind}`);
  }

  return (
    <div
      className={`conv-item ${p.isActive ? "active" : ""}`}
      onClick={onItemClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onItemClick();
        }
      }}
    >
      <span className="conv-cover">
        {conv.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={conv.cover_url} alt="" loading="lazy" />
        ) : conv.is_default ? (
          <span aria-hidden>📁</span>
        ) : (
          <span aria-hidden>✨</span>
        )}
      </span>

      {p.isRenaming ? (
        <input
          autoFocus
          className="conv-rename-input"
          value={p.renameValue}
          onChange={(e) => p.onRenameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") p.onRenameSubmit();
            if (e.key === "Escape") p.onRenameCancel();
          }}
          onBlur={() => p.onRenameSubmit()}
        />
      ) : p.isConfirmingDelete ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: "var(--danger)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            确认删除?
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              p.onConfirmDelete();
            }}
            style={{
              padding: "3px 8px", borderRadius: 4, border: "none",
              background: "var(--danger)", color: "#fff",
              fontSize: 11, cursor: "pointer"
            }}
          >
            删除
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              p.onCancelDelete();
            }}
            style={{
              padding: "3px 6px", borderRadius: 4,
              border: "1px solid var(--border)", background: "transparent",
              fontSize: 11, color: "var(--text-2)", cursor: "pointer"
            }}
          >
            取消
          </button>
        </div>
      ) : (
        <span className={`conv-name ${isNamed ? "" : "empty"}`} title={displayName}>
          {displayName}
        </span>
      )}

      {/* 默认创作:无 ⋯ menu;其它会话 hover 时显示 */}
      {!conv.is_default && !p.isRenaming && !p.isConfirmingDelete && (
        <button
          type="button"
          className="conv-menu-btn"
          data-open={p.isMenuOpen ? "true" : "false"}
          onClick={(e) => {
            e.stopPropagation();
            p.onMenuToggle();
          }}
          title="更多"
          aria-label="更多操作"
        >
          <MoreIcon />
        </button>
      )}

      {p.isMenuOpen && (
        <div
          className="conv-menu"
          style={{ right: 8, top: 40 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="conv-menu-item"
            onClick={() => p.onPin()}
          >
            <PinIcon /> {conv.pinned_at ? "取消置顶" : "置顶"}
          </button>
          <button
            type="button"
            className="conv-menu-item"
            onClick={() => p.onStartRename()}
          >
            <PencilIcon /> 重命名
          </button>
          <button
            type="button"
            className="conv-menu-item danger"
            onClick={() => p.onStartDelete()}
          >
            <TrashIcon /> 删除
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────

// V1 加 B(2026-05-29):panel toggle icon 用更明显的 PanelLeft 风格(矩形 + 分隔线),18px 替代之前 14px chevron
function PanelToggleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function PencilSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v6l4 4-10 2 6-2v8" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
