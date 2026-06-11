"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 历史画廊瓦片上的「收藏 + 标签分组」按钮(2026-05-22)
// 点击 ⭐:未收藏 → 先收藏,再弹出标签分组下拉;已收藏 → 直接弹下拉管理标签
// 浮层(zoom-in,createPortal 绕开瓦片 overflow-hidden):
//   顶部「已收藏」/「加入标签分组」下拉选择 + 新建标签 / 同行的 取消收藏 + 保存

type Props = {
  taskId: string;
  outputIndex: number; // 本瓦片对应的产物下标(收藏粒度)
  collectionId: number | null;
  collectionTags: string | null;
  userTags: string[];
  onCollectChange: (
    taskId: string,
    outputIndex: number,
    collectionId: number | null,
    tags: string | null
  ) => void;
  onTagCreated: (tag: string) => void;
};

const MENU_W = 240;

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return [...new Set(tags.split(",").map(t => t.trim()).filter(Boolean))];
}

function tagSummary(tags: string[]): string {
  if (tags.length === 0) return "选择标签分组";
  if (tags.length <= 2) return tags.join("、");
  return `${tags[0]}、${tags[1]} 等 ${tags.length} 个`;
}

export function TileCollectMenu({
  taskId,
  outputIndex,
  collectionId,
  collectionTags,
  userTags,
  onCollectChange,
  onTagCreated
}: Props) {
  const [cid, setCid] = useState<number | null>(collectionId);
  const [savedTags, setSavedTags] = useState<string[]>(parseTags(collectionTags));
  const [draftTags, setDraftTags] = useState<string[]>(parseTags(collectionTags));
  const [open, setOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");

  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCid(collectionId), [collectionId]);
  useEffect(() => setSavedTags(parseTags(collectionTags)), [collectionTags]);

  const collected = cid != null;
  const dirty = draftTags.join(",") !== savedTags.join(",");
  // 用户在输入框里打了字但还没按回车 → 把"待提交输入"也算成可保存的脏标志
  // 不然用户会以为输入完就能直接保存（image #31 的迷惑点）
  const hasPendingDraft = draft.trim().length > 0;
  const canSave = collected && (dirty || hasPendingDraft) && !saving;

  const close = useCallback(() => {
    setOpen(false);
    setTagOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  function computePos() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    let left = Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 8);
    left = Math.max(8, left);
    let top = rect.bottom + 6;
    if (top + 340 > window.innerHeight) top = Math.max(8, rect.top - 340);
    setPos({ top, left });
  }

  async function handleStarClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (open) {
      close();
      return;
    }
    if (busy) return;
    // 已收藏:再点一下直接取消收藏(不弹菜单)
    if (cid != null) {
      handleUncollect();
      return;
    }
    // 未收藏:收藏成功后弹出标签分组菜单
    setBusy(true);
    try {
      const res = await fetch("/api/prompts/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, output_index: outputIndex })
      });
      if (!res.ok) {
        if (res.status === 422) alert("已达到 200 条收藏上限,请到收藏页清理后再收藏");
        throw new Error(`status ${res.status}`);
      }
      const row = (await res.json()) as { id: number };
      setCid(row.id);
      setSavedTags([]);
      setDraftTags([]);
      onCollectChange(taskId, outputIndex, row.id, null);
    } catch {
      setBusy(false);
      return;
    }
    setBusy(false);
    setDraft("");
    setTagOpen(false);
    computePos();
    setOpen(true);
  }

  function toggleTag(t: string) {
    setDraftTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
  }

  function addNewTag() {
    const t = draft.trim().replace(/,/g, "");
    setDraft("");
    if (!t) return;
    setDraftTags(prev => (prev.includes(t) ? prev : [...prev, t]));
    setTagOpen(true);
  }

  async function handleSave() {
    if (cid == null || !canSave) return;

    // 自动提交输入框未回车的待加标签 → 用户体验：输入完直接点保存就好
    let finalTags = draftTags;
    if (hasPendingDraft) {
      const t = draft.trim().replace(/,/g, "");
      if (t && !draftTags.includes(t)) {
        finalTags = [...draftTags, t];
      }
    }

    setSaving(true);
    const tagsStr = finalTags.length > 0 ? finalTags.join(",") : null;
    try {
      const res = await fetch(`/api/prompts/collect/${cid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: tagsStr })
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setSavedTags(finalTags);
      setDraftTags(finalTags);
      setDraft("");
      onCollectChange(taskId, outputIndex, cid, tagsStr);
      for (const t of finalTags) if (!userTags.includes(t)) onTagCreated(t);
      close();
    } catch {
      alert("标签保存失败,请重试");
    } finally {
      setSaving(false);
    }
  }

  async function handleUncollect() {
    if (cid == null) return;
    const prevCid = cid;
    close();
    setCid(null);
    setSavedTags([]);
    setDraftTags([]);
    onCollectChange(taskId, outputIndex, null, null);
    try {
      const res = await fetch(`/api/prompts/collect/${prevCid}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch {
      setCid(prevCid);
      onCollectChange(taskId, outputIndex, prevCid, null);
      alert("取消收藏失败,请重试");
    }
  }

  const menuTags = [...new Set([...userTags, ...draftTags])].sort((a, b) => a.localeCompare(b, "zh"));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleStarClick}
        title={collected ? "管理收藏标签" : "收藏"}
        aria-label={collected ? "管理收藏标签" : "收藏"}
        className={
          "absolute right-2 top-2 w-9 h-9 rounded-lg shadow-md grid place-items-center transition " +
          (collected
            ? "bg-white text-[#E0992F] opacity-100"
            : "bg-white text-text opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-white") +
          (busy ? " cursor-wait" : "")
        }
      >
        <StarIcon filled={collected} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            onClick={e => e.stopPropagation()}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_W }}
            className="z-[60] rounded-lg border border-border bg-card shadow-md p-2 animate-zoom-in"
          >
            {/* 顶部标题:只保留「已收藏」*/}
            <div className="flex items-center gap-1.5 px-1.5 pb-1.5 mb-1.5 border-b border-border">
              <span className="text-[#E0992F]">
                <StarIcon filled />
              </span>
              <span className="text-cap text-text font-medium">已收藏</span>
            </div>

            {/* 加入标签分组(区域块标题 + 下拉选择)*/}
            <div className="px-0.5">
              <div className="text-chip text-text-3 mb-1">
                加入标签分组<span className="opacity-60">(可选)</span>
              </div>
              <button
                type="button"
                onClick={() => setTagOpen(v => !v)}
                className="w-full h-8 px-2.5 rounded-md border border-border-strong bg-card flex items-center gap-1.5 text-sub hover:border-primary transition"
              >
                <span className={"flex-1 text-left truncate " + (draftTags.length ? "text-text" : "text-text-3")}>
                  {tagSummary(draftTags)}
                </span>
                {draftTags.length > 0 && (
                  <span className="num text-chip text-violet bg-violet-soft rounded px-1">
                    {draftTags.length}
                  </span>
                )}
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={"text-text-3 transition-transform " + (tagOpen ? "rotate-180" : "")}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {/* 展开:标签多选列表 */}
              {tagOpen && (
                <div className="mt-1 max-h-[148px] overflow-y-auto rounded-md border border-border bg-card-soft p-1">
                  {menuTags.length === 0 ? (
                    <div className="px-1.5 py-2 text-chip text-text-3">还没有标签,在下方新建</div>
                  ) : (
                    menuTags.map(t => {
                      const on = draftTags.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTag(t)}
                          className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded text-sub text-text hover:bg-bg transition text-left"
                        >
                          <span
                            className={
                              "w-4 h-4 rounded grid place-items-center shrink-0 border " +
                              (on ? "bg-violet border-violet text-white" : "border-border-strong text-transparent")
                            }
                          >
                            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12l5 5L20 7" />
                            </svg>
                          </span>
                          <span className="truncate">{t}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* 新建标签 */}
              <input
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNewTag();
                  }
                }}
                maxLength={20}
                placeholder="新建标签,回车加入"
                className="w-full h-8 mt-1.5 px-2 rounded border border-border-strong bg-card text-chip text-text outline-none focus:border-primary placeholder:text-placeholder"
              />
            </div>

            {/* 保存(取消收藏改为直接点瓦片 ⭐) — 待提交的输入框内容也算可保存 */}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="w-full h-8 mt-2 rounded-md bg-primary text-white text-small font-medium hover:bg-primary-ink transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.6l-5.88 3.01 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z" />
    </svg>
  );
}
