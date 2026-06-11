"use client";

import { type GalleryTile, ratioToAspect } from "./types";
import { TileCollectMenu } from "./TileCollectMenu";

// 历史画廊瓦片(2026-05-21 重塑 + 同日反馈再调;2026-05-22 改单张粒度选择)
// 选择粒度 = 单张瓦片(tile.key),框选 / 单击均不连带同任务其它张

const TILE_H = 188;

type Props = {
  tile: GalleryTile;
  selectMode: boolean;
  selected: boolean; // 本张瓦片是否被选中
  userTags: string[];
  onToggleSelect: (tileKey: string) => void;
  onOpen: (tile: GalleryTile) => void;
  onCollectChange: (taskId: string, outputIndex: number, collectionId: number | null, tags: string | null) => void;
  onTagCreated: (tag: string) => void;
};

export function HistoryTile({
  tile,
  selectMode,
  selected,
  userTags,
  onToggleSelect,
  onOpen,
  onCollectChange,
  onTagCreated
}: Props) {
  const { task, output } = tile;
  const isVideo = task.type === "video";
  const hasImg = !!output && !!output.file_url && !isVideo;

  function handleClick() {
    if (selectMode) {
      onToggleSelect(tile.key);
    } else {
      onOpen(tile);
    }
  }

  const frameCls =
    "group relative shrink-0 rounded-lg overflow-hidden border bg-bg cursor-pointer transition " +
    (selected
      ? "border-primary ring-2 ring-primary/40"
      : "border-border hover:border-border-strong hover:shadow-md");

  // 图片瓦片:容器贴合图片(固定高 + 原始宽,不裁剪)
  if (hasImg) {
    return (
      <div onClick={handleClick} data-tile-key={tile.key} className={frameCls} style={{ height: TILE_H }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={output!.file_url!}
          alt=""
          loading="lazy"
          width={output!.width ?? undefined}
          height={output!.height ?? undefined}
          className="block w-auto"
          style={{ height: TILE_H }}
        />
        <Overlays
          tile={tile}
          selectMode={selectMode}
          selected={selected}
          userTags={userTags}
          onToggleSelect={onToggleSelect}
          onCollectChange={onCollectChange}
          onTagCreated={onTagCreated}
        />
      </div>
    );
  }

  // 视频 / 无产物瓦片:固定高 + 比例盒
  return (
    <div onClick={handleClick} data-tile-key={tile.key} className={frameCls} style={{ height: TILE_H, aspectRatio: ratioToAspect(task.ratio) }}>
      {isVideo && output && output.file_url ? (
        <>
          {/* 视频首帧 — #t=0.1 让浏览器跳到 0.1s 渲染一帧作封面 */}
          <video
            src={`${output.file_url}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover bg-black"
          />
          <span className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm grid place-items-center text-white">
              <PlayIcon />
            </span>
          </span>
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center text-small text-text-3 px-2 text-center">
          {task.status === "failed"
            ? "生成失败"
            : task.status === "running" || task.status === "pending"
              ? "生成中…"
              : "无产物"}
        </div>
      )}
      <Overlays
        tile={tile}
        selectMode={selectMode}
        selected={selected}
        userTags={userTags}
        onToggleSelect={onToggleSelect}
        onCollectChange={onCollectChange}
        onTagCreated={onTagCreated}
      />
    </div>
  );
}

function Overlays({
  tile,
  selectMode,
  selected,
  userTags,
  onToggleSelect,
  onCollectChange,
  onTagCreated
}: {
  tile: GalleryTile;
  selectMode: boolean;
  selected: boolean;
  userTags: string[];
  onToggleSelect: (tileKey: string) => void;
  onCollectChange: (taskId: string, outputIndex: number, collectionId: number | null, tags: string | null) => void;
  onTagCreated: (tag: string) => void;
}) {
  const { task, output } = tile;
  const isVideo = task.type === "video";

  return (
    <>
      {/* 收藏 + 标签分组按钮(下载按钮下方,非选择模式)*/}
      {/* 收藏粒度到单张:用本瓦片对应产物的收藏态(无产物占位用首张 = output 0)*/}
      {!selectMode && (
        <TileCollectMenu
          taskId={task.id}
          outputIndex={output?.output_index ?? 0}
          collectionId={output ? output.collection_id : task.collection_id}
          collectionTags={output ? output.collection_tags : task.collection_tags}
          userTags={userTags}
          onCollectChange={onCollectChange}
          onTagCreated={onTagCreated}
        />
      )}

      {/* 视频时长角标 */}
      {isVideo && output && (
        <span className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded bg-black/55 text-white text-chip num">
          {task.duration_seconds ? `${task.duration_seconds}s` : "视频"}
        </span>
      )}

      {/* 选择模式:选中态遮罩 + 勾选框 */}
      {selectMode && (
        <>
          <span
            className={
              "absolute inset-0 pointer-events-none transition " +
              (selected ? "bg-primary/15" : "bg-transparent")
            }
          />
          <span onClick={e => e.stopPropagation()} className="absolute left-1.5 top-1.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(tile.key)}
              className="w-[18px] h-[18px] accent-primary align-middle"
            />
          </span>
        </>
      )}

      {/* hover 右上角下载按钮(白底,明显;淡入 + 轻微放大)*/}
      {!selectMode && output && output.file_url && (
        <a
          href={output.file_url}
          download
          onClick={e => e.stopPropagation()}
          title="下载这张"
          aria-label="下载"
          className="absolute right-2 top-[52px] w-9 h-9 rounded-lg bg-white text-text shadow-md grid place-items-center opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 hover:bg-primary hover:text-white transition"
        >
          <DownloadIcon />
        </a>
      )}
    </>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12" />
      <path d="M6 12l6 6 6-6" />
      <path d="M4 20h16" />
    </svg>
  );
}
