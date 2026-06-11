"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ParamSelect } from "@/components/generate/ParamSelect";
import { DateRangeFilter } from "./DateRangeFilter";
import { HistoryTile } from "./HistoryTile";
import { HistoryList } from "./HistoryList";
import { HistoryDetailModal } from "./HistoryDetailModal";
import { type HistoryRow, buildGallery } from "./types";

// 资产页主体(2026-05-22:历史记录 + Prompt 收藏 合并为「资产」)
// 双行筛选(图片/视频 tab + 时间/用途/模型/我的收藏)+ 日期分组网格 ⇄ 列表 + 批量下载 + 详情弹层

type Props = {
  initialRows: HistoryRow[];
  initialTotal: number;
  models: string[];
  purposes: string[];
  userTags: string[];
};

const PAGE_SIZE = 24; // 任务级分页;网格按张摊平后瓦片更多
const MAX_BATCH = 100; // V1.15:单次批量下载上限

type Detail = { task: HistoryRow; index: number };

export function HistoryView(props: Props) {
  const [type, setType] = useState<"image" | "video">("image");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [model, setModel] = useState("");
  const [purpose, setPurpose] = useState("");
  const [collected, setCollected] = useState(false);
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<HistoryRow[]>(props.initialRows);
  const [total, setTotal] = useState(props.initialTotal);
  const [loading, setLoading] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  // selected = 选中的瓦片 key 集合(粒度 = 单张,不连带同任务其它张)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Detail | null>(null);
  // 用户全部标签;瓦片收藏菜单新建标签后并入,供其它瓦片复用
  const [userTags, setUserTags] = useState<string[]>(props.userTags);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0); // 批量收藏后 +1 触发重新拉取
  // 框选矩形(viewport 坐标);拖拽中才非空
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const isInitialMount = useRef(true);
  const galleryRef = useRef<HTMLDivElement>(null);
  const didDragRef = useRef(false); // 刚发生过框选拖拽 → 抑制随后的瓦片 click
  const dragRef = useRef<{ x: number; y: number; base: Set<string>; active: boolean } | null>(null);

  // 视图偏好持久化
  useEffect(() => {
    const saved = window.localStorage.getItem("history:view");
    if (saved === "list" || saved === "grid") setView(saved);
  }, []);
  function changeView(v: "grid" | "list") {
    setView(v);
    try {
      window.localStorage.setItem("history:view", v);
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => {
      setQApplied(q.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // 筛选 / 翻页变化 → 退出选择模式
  useEffect(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, [type, dateFrom, dateTo, model, purpose, collected, qApplied, page]);

  // 拉数据(首屏走 SSR initialRows)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    const sp = new URLSearchParams();
    sp.set("type", type);
    if (dateFrom) sp.set("date_from", dateFrom);
    if (dateTo) sp.set("date_to", dateTo);
    if (model) sp.set("model", model);
    if (purpose) sp.set("purpose", purpose);
    if (collected) sp.set("collected", "true");
    if (qApplied) sp.set("q", qApplied);
    sp.set("page", String(page));
    sp.set("page_size", String(PAGE_SIZE));
    fetch(`/api/tasks?${sp.toString()}`, { signal: ac.signal })
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => {
        /* abort / 网络错误:保留旧数据 */
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [type, dateFrom, dateTo, model, purpose, collected, qApplied, page, refreshNonce]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 一个 task 的瓦片 key 列表(succeeded 多产物 → 多 key,否则 1 个 placeholder key)
  function taskTileKeys(r: HistoryRow): string[] {
    if (r.status === "succeeded" && r.outputs.length > 0) {
      return r.outputs.map(o => `${r.id}:${o.output_index}`);
    }
    return [`${r.id}:placeholder`];
  }
  // 「我的收藏」视图:每行只保留已收藏的产物(过滤掉同批未收藏的),其它视图展示全部
  const displayRows = collected
    ? rows
        .map(r => ({ ...r, outputs: r.outputs.filter(o => o.collection_id != null) }))
        .filter(r => r.outputs.length > 0 || r.collection_id != null)
    : rows;
  const allTileKeys = displayRows.flatMap(taskTileKeys);
  const allSelectedOnPage = allTileKeys.length > 0 && allTileKeys.every(k => selected.has(k));
  const canBatch = selected.size > 0 && selected.size <= MAX_BATCH;
  // 列表视图按整行(任务)粒度:行选中 = 该任务全部瓦片 key 都被选
  const listSelectedRowIds = new Set(
    displayRows.filter(r => taskTileKeys(r).every(k => selected.has(k))).map(r => r.id)
  );
  const hasFilter =
    model !== "" || purpose !== "" || qApplied !== "" || collected || dateFrom !== "" || dateTo !== "";

  // 瓦片收藏菜单用:更新某任务「某张产物」的收藏态(收藏粒度到单张)
  function onCollectChange(
    id: string,
    outputIndex: number,
    cid: number | null,
    tags: string | null
  ) {
    const patchRow = (x: HistoryRow): HistoryRow => {
      if (x.id !== id) return x;
      const outputs = x.outputs.map(o =>
        o.output_index === outputIndex ? { ...o, collection_id: cid, collection_tags: tags } : o
      );
      // output 0 同步到行级(列表视图 / 占位瓦片用)
      return outputIndex === 0
        ? { ...x, outputs, collection_id: cid, collection_tags: tags }
        : { ...x, outputs };
    };
    setRows(prev => prev.map(patchRow));
    setDetail(d => (d && d.task.id === id ? { ...d, task: patchRow(d.task) } : d));
  }
  // 列表视图 ⭐:对首张产物(output 0)收藏 / 取消
  function onStarChange(id: string, cid: number | null) {
    onCollectChange(id, 0, cid, null);
  }
  // 瓦片菜单新建标签 → 并入全局标签列表
  function onTagCreated(tag: string) {
    setUserTags(prev => (prev.includes(tag) ? prev : [...prev, tag].sort((a, b) => a.localeCompare(b, "zh"))));
  }
  // 网格单张瓦片 toggle(单击 / 勾选框);刚框选拖拽过则抑制本次 click
  function toggleTile(key: string) {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }
  // 列表整行 toggle(任务全部瓦片一起)
  function toggleTaskSelection(taskId: string) {
    const row = displayRows.find(r => r.id === taskId);
    if (!row) return;
    const keys = taskTileKeys(row);
    setSelected(prev => {
      const n = new Set(prev);
      const allOn = keys.every(k => n.has(k));
      keys.forEach(k => (allOn ? n.delete(k) : n.add(k)));
      return n;
    });
  }
  function toggleSelectAll() {
    setSelected(allSelectedOnPage ? new Set() : new Set(allTileKeys));
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }
  // 选中瓦片 → 去重任务 id
  function selectedTaskIds(): string[] {
    return [...new Set([...selected].map(k => k.split(":")[0]))];
  }
  function triggerDownload() {
    // 下载按任务打包(沿用 V1.15 接口):选中瓦片归属的 succeeded 任务
    const ids = selectedTaskIds().filter(id => displayRows.find(r => r.id === id)?.status === "succeeded");
    if (ids.length === 0) {
      alert("选中的内容没有可下载的成品");
      return;
    }
    window.location.href = `/api/tasks/batch-download?ids=${ids.join(",")}`;
    setTimeout(exitSelectMode, 500);
  }
  async function triggerDelete() {
    const ids = selectedTaskIds();
    if (ids.length === 0 || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/tasks/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setRows(prev => prev.filter(r => !ids.includes(r.id)));
      setTotal(t => Math.max(0, t - ids.length));
      setConfirmDelete(false);
      exitSelectMode();
    } catch {
      alert("删除失败,请重试");
    } finally {
      setDeleting(false);
    }
  }
  // 批量收藏:选中瓦片(单张粒度)逐张收藏
  async function triggerCollect() {
    if (selected.size === 0 || collecting) return;
    const items = [...selected].map(k => {
      const [tid, idxPart] = k.split(":");
      return { task_id: tid, output_index: idxPart === "placeholder" ? 0 : Number(idxPart) || 0 };
    });
    setCollecting(true);
    try {
      const res = await fetch("/api/prompts/collect/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const d = (await res.json()) as { collected: number; limitReached: boolean };
      if (d.limitReached) {
        alert(`已收藏 ${d.collected} 张;触达 200 条收藏上限,其余未收藏`);
      }
      setRefreshNonce(n => n + 1); // 重新拉取,刷新 ⭐ 状态
      exitSelectMode();
    } catch {
      alert("批量收藏失败,请重试");
    } finally {
      setCollecting(false);
    }
  }

  // ── 框选(橡皮筋矩形)────────────────────────────────────────────────────
  function onMarqueeMove(e: MouseEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active && Math.hypot(dx, dy) < 6) return; // 阈值内不算拖拽
    d.active = true;
    didDragRef.current = true;
    const left = Math.min(d.x, e.clientX);
    const top = Math.min(d.y, e.clientY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    setMarquee({ left, top, width, height });
    // 实时命中:base ∪ 框内瓦片
    const box = { left, top, right: left + width, bottom: top + height };
    const hit = new Set(d.base);
    galleryRef.current?.querySelectorAll<HTMLElement>("[data-tile-key]").forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) {
        const k = el.getAttribute("data-tile-key");
        if (k) hit.add(k);
      }
    });
    setSelected(hit);
  }
  function onMarqueeUp() {
    window.removeEventListener("mousemove", onMarqueeMove);
    window.removeEventListener("mouseup", onMarqueeUp);
    setMarquee(null);
    dragRef.current = null;
  }
  function onGalleryMouseDown(e: React.MouseEvent) {
    if (!selectMode || e.button !== 0) return;
    didDragRef.current = false;
    dragRef.current = { x: e.clientX, y: e.clientY, base: new Set(selected), active: false };
    window.addEventListener("mousemove", onMarqueeMove);
    window.addEventListener("mouseup", onMarqueeUp);
  }

  const emptyHint = hasFilter ? (
    "没有符合条件的记录,试试调整筛选条件"
  ) : (
    <>
      还没有生成记录,去{" "}
      <Link href="/" className="text-primary hover:text-primary-ink">
        生成页
      </Link>{" "}
      试试吧
    </>
  );

  return (
    <div className="mx-auto max-w-content w-full px-8 py-6">
      {/* sticky 顶部容器：筛选栏 + 批量操作工具条同时钉住，避免批量模式下工具消失 */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--bg)",
          paddingTop: 8,
          paddingBottom: 8,
          marginLeft: -32,
          marginRight: -32,
          paddingLeft: 32,
          paddingRight: 32,
          marginTop: -24,
          marginBottom: 16,
          boxShadow: "0 6px 12px -10px rgba(0,0,0,.08)"
        }}
      >
        {/* 第一行:类型 tab */}
        <div className="flex items-center gap-1 border-b border-border mb-3">
          <TypeTab active={type === "image"} onClick={() => { setType("image"); setPage(1); }}>
            图片
          </TypeTab>
          <TypeTab active={type === "video"} onClick={() => { setType("video"); setPage(1); }}>
            视频
          </TypeTab>
        </div>

        {/* 第二行:时间 / 用途 / 模型 / 我的收藏 + 搜索 + 视图/批量 */}
        <div className="flex items-center flex-wrap gap-2">
          <DateRangeFilter
            onChange={(f, t) => {
              setDateFrom(f);
              setDateTo(t);
              setPage(1);
            }}
          />
          <ParamSelect<string>
            label="用途"
            value={purpose}
            onChange={v => {
              setPurpose(v);
              setPage(1);
            }}
            options={[{ value: "", label: "全部" }, ...props.purposes.map(p => ({ value: p, label: p }))]}
          />
          <ParamSelect<string>
            label="模型"
            value={model}
            onChange={v => {
              setModel(v);
              setPage(1);
            }}
            valueMaxWidth={180}
            options={[{ value: "", label: "全部" }, ...props.models.map(m => ({ value: m, label: m }))]}
          />
          {/* 我的收藏 开关 */}
          <button
            type="button"
            onClick={() => {
              setCollected(c => !c);
              setPage(1);
            }}
            className={
              "h-10 px-3.5 rounded-md border inline-flex items-center gap-1.5 text-body transition " +
              (collected
                ? "border-[#E0992F]/55 bg-warn-soft text-[#9A6111]"
                : "border-border-strong bg-card text-text-2 hover:border-primary hover:text-primary")
            }
          >
            <FavStarIcon filled={collected} />
            我的收藏
          </button>

          {/* 搜索 */}
          <div className="h-10 px-3.5 rounded-md border border-border-strong bg-card inline-flex items-center gap-2 min-w-[220px]">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-3 shrink-0">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="搜索 Prompt 内容"
              className="flex-1 min-w-0 bg-transparent outline-none text-body text-text placeholder:text-text-3"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="清空搜索" className="text-text-3 hover:text-text shrink-0">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>

          {/* 右侧:视图切换 + 批量下载 */}
          <div className="ml-auto flex items-center gap-2">
            <ViewToggle view={view} onChange={changeView} />
            {!selectMode && (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="h-10 px-3.5 rounded-md border border-border-strong bg-card text-body text-text-2 hover:border-primary hover:text-primary transition inline-flex items-center gap-1.5"
              >
                <CheckSquareIcon />
                批量操作
              </button>
            )}
          </div>
        </div>

        {/* 选择模式工具条 — 移入 sticky 容器内，批量模式下也跟随固定 */}
        {selectMode && (
          <div className="mt-3 rounded-md bg-primary-soft border border-primary/30 px-4 py-2.5 flex items-center gap-3 text-small">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allSelectedOnPage} onChange={toggleSelectAll} className="w-4 h-4 accent-primary" />
            <span className="text-text-2">全选本页({allTileKeys.length})</span>
          </label>
          <span className="text-primary font-medium num">已选 {selected.size} 张</span>
          {selected.size > MAX_BATCH && <span className="text-danger">超出上限({MAX_BATCH})</span>}
          <span className="text-text-3 hidden sm:inline">框选或单击选择;下载按任务打包</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={triggerCollect}
              disabled={!canBatch || collecting}
              className="h-8 px-3 rounded-md border border-[#E0992F]/55 bg-warn-soft text-[#9A6111] text-small font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <FavStarIcon filled />
              {collecting ? "收藏中…" : "收藏"}
            </button>
            <button
              type="button"
              onClick={triggerDownload}
              disabled={!canBatch}
              className="h-8 px-3 rounded-md bg-primary text-white text-small font-medium hover:bg-primary-ink disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <DownloadIcon />
              下载
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={!canBatch}
              className="h-8 px-3 rounded-md bg-danger text-white text-small font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <TrashIcon />
              删除
            </button>
            <button
              type="button"
              onClick={exitSelectMode}
              className="h-8 px-3 rounded-md border border-border bg-card text-small text-text-2 hover:border-border-strong"
            >
              取消
            </button>
          </div>
        </div>
        )}
      </div>

      {/* 内容区 */}
      {view === "grid" ? (
        loading ? (
          <GridSkeleton />
        ) : displayRows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card text-center text-text-3 py-20">{emptyHint}</div>
        ) : (
          <div
            ref={galleryRef}
            onMouseDown={onGalleryMouseDown}
            className={"space-y-8 " + (selectMode ? "select-none" : "")}
          >
            {buildGallery(displayRows).map(g => (
              <section key={g.key}>
                <h3 className="text-h1 text-text mb-3 num">{g.label}</h3>
                <div className="space-y-4">
                  {g.sections.map(sec => (
                    <div key={sec.kind}>
                      {/* 仅当该日期同时有图片和视频时,显示类型小标题 */}
                      {g.mixed && (
                        <div className="text-sub font-medium text-text-2 mb-2">
                          {sec.kind === "image" ? "图片" : "视频"}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 items-start">
                        {sec.tiles.map(t => (
                          <HistoryTile
                            key={t.key}
                            tile={t}
                            selectMode={selectMode}
                            selected={selected.has(t.key)}
                            userTags={userTags}
                            onToggleSelect={toggleTile}
                            onCollectChange={onCollectChange}
                            onTagCreated={onTagCreated}
                            onOpen={tile => {
                              const idx = tile.output
                                ? tile.task.outputs.findIndex(o => o.output_index === tile.output!.output_index)
                                : 0;
                              setDetail({ task: tile.task, index: Math.max(0, idx) });
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <HistoryList
          rows={displayRows}
          loading={loading}
          selectMode={selectMode}
          selected={listSelectedRowIds}
          allSelectedOnPage={allSelectedOnPage}
          onToggleSelect={toggleTaskSelection}
          onToggleSelectAll={toggleSelectAll}
          onOpen={row => setDetail({ task: row, index: 0 })}
          onStarChange={onStarChange}
          emptyHint={emptyHint}
        />
      )}

      {/* 翻页 — sticky 底部，长列表滚动时仍可见 */}
      {total > PAGE_SIZE && (
        <div
          className="flex items-center justify-between text-small text-text-2"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 9,
            background: "var(--bg)",
            paddingTop: 12,
            paddingBottom: 12,
            // 抹平父 wrapper px-8 让条铺满
            marginLeft: -32,
            marginRight: -32,
            paddingLeft: 32,
            paddingRight: 32,
            marginTop: 20,
            // 上沿微阴影区分内容区
            boxShadow: "0 -6px 12px -10px rgba(0,0,0,.08)"
          }}
        >
          <span>
            共 <span className="num text-text font-medium">{total}</span> 个任务,第{" "}
            <span className="num">{page}</span> / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <PagerBtn disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              上一页
            </PagerBtn>
            <PagerBtn disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              下一页
            </PagerBtn>
          </div>
        </div>
      )}

      {/* 详情弹层 */}
      {detail && (
        <HistoryDetailModal
          task={detail.task}
          initialIndex={detail.index}
          onClose={() => setDetail(null)}
        />
      )}

      {/* 框选橡皮筋矩形(viewport 坐标)*/}
      {marquee && (
        <div
          className="fixed z-40 pointer-events-none rounded-sm border border-primary bg-primary/10"
          style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
        />
      )}

      {/* 批量删除确认 */}
      {confirmDelete && (
        <ConfirmDeleteModal
          tileCount={selected.size}
          taskCount={selectedTaskIds().length}
          deleting={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={triggerDelete}
        />
      )}
    </div>
  );
}

// 批量删除二次确认弹层
function ConfirmDeleteModal({
  tileCount,
  taskCount,
  deleting,
  onCancel,
  onConfirm
}: {
  tileCount: number;
  taskCount: number;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      className="fixed inset-0 z-50 grid place-items-center p-4 animate-fade-in"
      style={{ background: "rgba(20,26,40,.36)", backdropFilter: "blur(2px)" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[400px] max-w-full rounded-lg bg-card shadow-md overflow-hidden animate-zoom-in"
      >
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
          <span className="w-9 h-9 rounded-lg bg-danger-soft text-danger grid place-items-center shrink-0">
            <TrashIcon />
          </span>
          <h3 className="text-body font-semibold text-text">确认删除资产?</h3>
        </div>
        <div className="px-5 pb-4 text-sub text-text-2 leading-relaxed">
          已选中 <span className="num font-medium text-text">{tileCount}</span> 张,涉及{" "}
          <span className="num font-medium text-text">{taskCount}</span>{" "}
          个生成任务。删除将连同任务的<span className="text-danger">全部产物一并移除,不可恢复</span>。
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-card-soft border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-9 px-4 rounded-md border border-border-strong bg-card text-small text-text-2 hover:border-border-strong disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="h-9 px-4 rounded-md bg-danger text-white text-small font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-wait"
          >
            {deleting ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: "grid" | "list"; onChange: (v: "grid" | "list") => void }) {
  return (
    <div className="h-10 p-1 rounded-md bg-bg border border-border inline-flex">
      <ViewBtn active={view === "grid"} onClick={() => onChange("grid")} label="网格视图">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </ViewBtn>
      <ViewBtn active={view === "list"} onClick={() => onChange("list")} label="列表视图">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
        </svg>
      </ViewBtn>
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  label,
  children
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={
        "w-9 h-full rounded grid place-items-center transition " +
        (active ? "bg-card text-primary shadow-sm" : "text-text-3 hover:text-text")
      }
    >
      {children}
    </button>
  );
}

function PagerBtn({
  disabled,
  onClick,
  children
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-7 px-3 rounded border border-border text-small disabled:opacity-40 disabled:cursor-not-allowed hover:border-border-strong"
    >
      {children}
    </button>
  );
}

function GridSkeleton() {
  // 两个日期组的骨架:日期标题 + 一行变宽瓦片
  const widths = [132, 176, 234, 176, 200];
  return (
    <div className="space-y-6">
      {[0, 1].map(g => (
        <div key={g}>
          <div className="h-4 w-20 bg-bg rounded animate-pulse mb-3" />
          <div className="flex flex-wrap gap-3">
            {widths.map((w, i) => (
              <div key={i} style={{ height: 176, width: w }} className="rounded-lg bg-bg border border-border animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// 第一行类型 tab(主,字号大于第二行筛选控件)
function TypeTab({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative h-9 px-3 text-[15px] transition " +
        (active ? "text-text font-semibold" : "text-text-3 hover:text-text-2")
      }
    >
      {children}
      {active && <span className="absolute left-2.5 right-2.5 -bottom-px h-[2px] rounded-t bg-primary" />}
    </button>
  );
}

function FavStarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12" />
      <path d="M6 12l6 6 6-6" />
      <path d="M4 20h16" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4h6v3" />
    </svg>
  );
}

function CheckSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L20 6" />
      <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}
