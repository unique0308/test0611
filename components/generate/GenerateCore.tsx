"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ModelRow, PurposeTagRow } from "@/lib/db/queries";
import { CollapsedDock } from "@/components/generate/CollapsedDock";
import { GenerationDock } from "@/components/generate/GenerationDock";
import { ResultFeedItem } from "@/components/generate/ResultFeedItem";
import { SkeletonResult } from "@/components/generate/SkeletonResult";
import { AssetPanel } from "@/components/generate/AssetPanel";
import {
  RATIOS,
  VIDEO_RATIOS,
  type FeedItem,
  type Kind,
  type PendingTask,
  type Ratio,
  type ReferenceImage
} from "@/components/generate/types";
import { effectiveRatio, getRatioSupport } from "@/lib/easyrouter/ratio-support";

// 生成核心(主屏)— "聊天式" dock 布局(2026-05-20 重塑)
//   hero      — 每次进入/刷新的初始态,dock 居中大卡 + 欢迎语
//   docked    — 本次会话生成后,dock 常驻视口底部;上方是结果 feed(最新在下)
//   collapsed — docked 的默认形态,dock 缩成一条窄横版;点 placeholder 展开为完整输入
//   maximized — 点 ⤢ 打开全屏 overlay 编辑长 prompt
//
// 决策记录(2026-05-20 与嘉斌):
//   - 截图里的 数字人 / 动作模仿 Tab 不加(超 V1 范围)
//   - 翻译图标 / 分辨率 / 帧率 不加(D7/D8 + V1 不做)
//   - "我的生成"4 列网格移除,结果区即生成 feed
//   - dock 常驻贴底(不随 feed 滚走);collapsed 默认,点击展开
//   - 不预载历史:每次进入/刷新/重新登录都从 hero 起,生成后才进 docked feed

type Props = {
  imageModels: ModelRow[];
  videoModels: ModelRow[];
  purposeTags: PurposeTagRow[];
  defaultPurposeTagId: string;
  initialUsedCredits: number;
  initialLimitCredits: number;
  // 首屏 SSR 预载的最近成功记录(最新在末尾)+ 各 task 的收藏 id 快照
  initialFeedItems: FeedItem[];
  initialCollectionMap: Record<string, number>;
  // 当前用户 id — 用于 sessionStorage(草稿 / pending)归属校验(换账号失效)
  userId: string;
  // 2026-05-29 V1 加 B(设计参考 §3.1 + §4.1.1):当前 conversation_id
  // SSR 已按 conv 拉 initialFeedItems;新 task 提交时 body 带此 id;切 conv 时 page.tsx 给 <GenerateCore key={convId}> 强制重 mount
  conversationId: string;
  // 024 · M5 P1 波 2:当前 conv 的主标签 id;NULL=未选 → onSubmit blocking
  // 改主标签 = ConversationHeader 触发 PATCH → router.refresh() → SSR 重拉,此 prop 重注入
  primaryPurposeTagId: string | null;
  // 025 · M5 P1 波 3:"其他" tag id(active 池里 name_normalized='other_v2')
  // 用于 Dock:当 purposeTagId === otherPurposeTagId 时显示 optional <20 字 input
  otherPurposeTagId: string | null;
};

// 2026-05-29 V1 加 B:FEED sessionStorage 决策(2026-05-21)废止,feed 改 DB 按 conversation_id 拉(SSR 提供 initialFeedItems)
// pending 任务持久化 — 用户在生成等待期跳到 /assets / 切 conv / 刷新,占位卡 + 轮询自动恢复
// 校验 userId + convId:跨 conv 不复用(避免在 conv B 显示 conv A 的 pending)
const PENDING_STORAGE_KEY = "generate:session-pending";
// 草稿持久化 — prompt 文本 + 参考图 dataUrl,跨页面切换不丢
// (参考图 dataUrl 可能 MB 级,sessionStorage 满了会抛 QuotaExceededError,catch 静默,降级 prompt-only)
const DRAFT_STORAGE_KEY = "generate:session-draft";

// feed 日期标题(2026-05-21:用日期分组标题代替原"图片生成"标题)
function feedDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// 把 feed(时间升序)按日期切成连续分组
function groupFeedByDate(items: FeedItem[]): { key: string; label: string; items: FeedItem[] }[] {
  const groups: { key: string; label: string; items: FeedItem[] }[] = [];
  for (const it of items) {
    const d = new Date(it.created_at);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, label: feedDateLabel(it.created_at), items: [it] });
  }
  return groups;
}

type ApiSuccess = {
  task_id: string;
  status: "succeeded" | "running" | "failed";
  type: Kind;
  file_url?: string;
  file_type?: string;
  output_count?: number;
  outputs?: Array<{ file_url: string; file_type: string; output_index: number }>;
  cost_cny?: number | null;
  credits_cost?: number | null;
  quota_warning?: "green" | "yellow" | "red";
  used_credits_after?: number;
  reference_image_url?: string | null;
  error_message?: string;
};

type ApiFailure = { error: { code: string; message: string } };

type TaskPoll = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  type: Kind;
  file_url?: string;
  file_type?: string;
  outputs?: Array<{ file_url: string; file_type: string; output_index: number }>;
  credits_cost?: number | null;
  cost_cny?: number | null;
  error_message?: string | null;
};

export function GenerateCore(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Day 45 续:sidebar「创作」组以 `?kind=image|video` 深链进入,initial 从 URL 读
  // V2 重塑:侧边栏切换 图片生成 / 视频生成 时（URL kind 变化），dock 内部 image/video tab 同步切换
  const urlKind: Kind = searchParams?.get("kind") === "video" ? "video" : "image";
  const [kind, setKind] = useState<Kind>(urlKind);
  const isVideo = kind === "video";

  // URL kind 变化（侧边栏切换） → 同步内部 kind state，并校验 ratio
  useEffect(() => {
    setKind((prev) => {
      if (prev === urlKind) return prev;
      // 切到视频且当前 ratio 不在视频集合，回退到 16:9
      if (urlKind === "video" && !(VIDEO_RATIOS as readonly string[]).includes(ratio)) {
        setRatio("16:9");
      }
      return urlKind;
    });
    // ratio 仅在 effect 触发时读，不参与依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKind]);

  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<Ratio>("3:4");
  // 024 · M5 P1 波 2:purposeTagId 初值 = primaryPurposeTagId(已选主标签)或 defaultPurposeTagId(兜底,波 3 去掉)
  // Dock dropdown 显示 = 单次"本次用途"(默认沿用主标签;员工临时切换 = 单次覆盖,不改主标签)
  const [purposeTagId, setPurposeTagId] = useState(
    props.primaryPurposeTagId ?? props.defaultPurposeTagId
  );
  // 025 · M5 P1 波 3:"其他"短文本(D16 DM5.1)
  // 仅在 purposeTagId === otherPurposeTagId 时启用 + 提交后 reset;maxLength=20 client/server 双校验
  const [otherNote, setOtherNote] = useState("");

  const [imageModelId, setImageModelId] = useState(
    props.imageModels.find(m => m.is_baseline)?.id ?? props.imageModels[0]?.id ?? ""
  );
  const [videoModelId, setVideoModelId] = useState(
    props.videoModels.find(m => m.is_baseline)?.id ?? props.videoModels[0]?.id ?? ""
  );
  const [duration, setDuration] = useState<5 | 10>(5);
  const [outputCount, setOutputCount] = useState<1 | 2 | 4>(1);

  const [purposeTags, setPurposeTags] = useState<PurposeTagRow[]>(props.purposeTags);
  const [newTagInputOpen, setNewTagInputOpen] = useState(false);
  const [newTagDraft, setNewTagDraft] = useState("");
  const [newTagSubmitting, setNewTagSubmitting] = useState(false);
  const [newTagError, setNewTagError] = useState<string | null>(null);

  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);

  // 结果 feed — 最新在末尾(chat 式);本次会话生成的结果
  // 2026-05-21:用 sessionStorage 持久化 —— 切到历史页再回来 / 刷新都保留本次对话;
  // 换账号(userId 不符)或关标签页则失效。修订 Day 39「每次进入从 hero 起」。
  const [feedItems, setFeedItems] = useState<FeedItem[]>(props.initialFeedItems);
  const [pending, setPending] = useState<PendingTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestTaskId, setLatestTaskId] = useState<string | null>(null);

  // mount 时从 sessionStorage 恢复 pending + 草稿(归属校验:userId + convId 都需匹配)
  // 2026-05-29 V1 加 B:FEED 不再从 sessionStorage 恢复(initialFeedItems 已由 SSR 按 conv 拉好)
  // pending 加 convId 校验:避免切 conv 时显示旧 conv 的 pending
  useEffect(() => {
    try {
      const rawPending = sessionStorage.getItem(PENDING_STORAGE_KEY);
      if (rawPending) {
        const saved = JSON.parse(rawPending) as { userId?: string; convId?: string; pending?: PendingTask };
        if (
          saved.userId === props.userId &&
          saved.convId === props.conversationId &&
          saved.pending &&
          saved.pending.taskId
        ) {
          setPending(saved.pending);
        } else if (saved.userId !== props.userId) {
          sessionStorage.removeItem(PENDING_STORAGE_KEY);
        }
      }
      const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (rawDraft) {
        const saved = JSON.parse(rawDraft) as {
          userId?: string;
          prompt?: string;
          referenceImage?: ReferenceImage | null;
        };
        if (saved.userId === props.userId) {
          if (saved.prompt) {
            setPrompt(saved.prompt);
            draftRef.current.prompt = saved.prompt;
          }
          if (saved.referenceImage) {
            setReferenceImage(saved.referenceImage);
            draftRef.current.referenceImage = saved.referenceImage;
          }
        } else {
          sessionStorage.removeItem(DRAFT_STORAGE_KEY);
        }
      }
    } catch {
      /* sessionStorage 不可用 / 解析失败:忽略 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2026-05-29 V1 加 B:writeFeed 不再写 sessionStorage,纯 setState
  // (DB 是 source of truth,SSR 在 conv 切换/刷新 时提供最新 initialFeedItems)
  const writeFeed = useCallback((updater: FeedItem[] | ((prev: FeedItem[]) => FeedItem[])) => {
    setFeedItems(prev => {
      const next = typeof updater === "function" ? (updater as (p: FeedItem[]) => FeedItem[])(prev) : updater;
      return next;
    });
  }, []);

  const writePending = useCallback((updater: PendingTask | null | ((prev: PendingTask | null) => PendingTask | null)) => {
    setPending(prev => {
      const next = typeof updater === "function" ? (updater as (p: PendingTask | null) => PendingTask | null)(prev) : updater;
      try {
        if (next && next.taskId) {
          // 加 convId 字段,跨 conv 切换不会复用旧 pending
          sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify({ userId: props.userId, convId: props.conversationId, pending: next }));
        } else {
          sessionStorage.removeItem(PENDING_STORAGE_KEY);
        }
      } catch {
        /* 忽略 */
      }
      return next;
    });
  }, [props.userId, props.conversationId]);

  // 草稿 ref — prompt + referenceImage 持有最新值(避免 writePrompt 闭包里拿不到最新 referenceImage)
  const draftRef = useRef<{ prompt: string; referenceImage: ReferenceImage | null }>({
    prompt: "",
    referenceImage: null
  });

  function persistDraft(next: { prompt: string; referenceImage: ReferenceImage | null }) {
    draftRef.current = next;
    const payload: Record<string, unknown> = { userId: props.userId };
    if (next.prompt) payload.prompt = next.prompt;
    if (next.referenceImage) payload.referenceImage = next.referenceImage;
    try {
      if (next.prompt || next.referenceImage) {
        sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      } else {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch {
      // QuotaExceededError(参考图 dataUrl 太大撑爆 storage)— 降级只存 prompt
      if (next.prompt) {
        try {
          sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ userId: props.userId, prompt: next.prompt }));
        } catch {
          /* 还是不行就算了,不影响主流程 */
        }
      }
    }
  }

  const writePrompt = useCallback((value: string) => {
    setPrompt(value);
    persistDraft({ prompt: value, referenceImage: draftRef.current.referenceImage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId]);

  const writeReference = useCallback((value: ReferenceImage | null) => {
    setReferenceImage(value);
    persistDraft({ prompt: draftRef.current.prompt, referenceImage: value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId]);

  // dock 默认折叠 — 用户必须点击 placeholder 才展开 / 提交时也强制折叠让位给主图
  // (与嘉斌 2026-05-20 决策:不点击不展示完整输入框)
  // 2026-05-27 新增：滚动触底时自动展开（admin 看完结果到底部时 dock 自然弹出）；
  //                离开底部时自动折叠（feed 滚动中 dock 让位）
  const [dockExpanded, setDockExpanded] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  // 用户点击右上角 ⤢ 触发放大编辑;Esc 或 ⤡ 收起
  const [dockMaximized, setDockMaximized] = useState(false);
  // 资产面板抽屉(点「生成历史」打开)
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);

  const [usedCredits, setUsedCredits] = useState(props.initialUsedCredits);
  const [quotaWarning, setQuotaWarning] = useState<"green" | "yellow" | "red">("green");

  // feed 可滚动容器 ref — 新结果落地后自动滚到底部(dock 常驻底部,不随 feed 滚动)
  const feedScrollRef = useRef<HTMLDivElement | null>(null);

  const currentModels = isVideo ? props.videoModels : props.imageModels;
  const currentModelId = isVideo ? videoModelId : imageModelId;

  // ─── prefill via ?prefill=... (来自历史页"使用此 Prompt"或重新生成)
  useEffect(() => {
    const raw = searchParams?.get("prefill");
    if (!raw) return;
    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(raw))))) as {
        type?: Kind;
        prompt?: string;
        ratio?: Ratio;
        model_name?: string;
        purpose_tag_name?: string;
        duration_seconds?: number;
      };
      if (payload.type === "image" || payload.type === "video") setKind(payload.type);
      if (payload.prompt) writePrompt(payload.prompt);
      if (payload.ratio && (RATIOS as readonly string[]).includes(payload.ratio)) setRatio(payload.ratio);
      if (payload.model_name) {
        const pool = payload.type === "video" ? props.videoModels : props.imageModels;
        const m = pool.find(x => x.name === payload.model_name);
        if (m) {
          if (payload.type === "video") setVideoModelId(m.id);
          else setImageModelId(m.id);
        }
      }
      if (payload.purpose_tag_name) {
        const t = props.purposeTags.find(t => t.name === payload.purpose_tag_name);
        if (t) setPurposeTagId(t.id);
      }
      if (payload.duration_seconds === 5 || payload.duration_seconds === 10) {
        setDuration(payload.duration_seconds);
      }
      router.replace("/");
    } catch {
      // 静默吞,prefill 失败不阻塞页面
    }
  }, [props.imageModels, props.purposeTags, props.videoModels, router, searchParams]);

  // ─── 创建使用目的(自定义标签)
  async function handleCreateTag() {
    const name = newTagDraft.trim();
    setNewTagError(null);
    if (!name) {
      setNewTagError("名称不能为空");
      return;
    }
    if (name.length > 32) {
      setNewTagError("≤ 32 字符");
      return;
    }
    setNewTagSubmitting(true);
    try {
      const res = await fetch("/api/purpose-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 409 && j.existing_name) {
          const existing = purposeTags.find(t => t.name === j.existing_name);
          if (existing) {
            setPurposeTagId(existing.id);
            setNewTagInputOpen(false);
            setNewTagDraft("");
            return;
          }
        }
        throw new Error(j.message ?? `创建失败 (${res.status})`);
      }
      const row = await res.json() as PurposeTagRow;
      setPurposeTags(prev => [...prev, row]);
      setPurposeTagId(row.id);
      setNewTagInputOpen(false);
      setNewTagDraft("");
    } catch (e) {
      setNewTagError((e as Error).message);
    } finally {
      setNewTagSubmitting(false);
    }
  }

  function buildPending(): PendingTask {
    const isOther = props.otherPurposeTagId != null && purposeTagId === props.otherPurposeTagId;
    return {
      taskId: null,
      kind,
      prompt: prompt.trim(),
      ratio,
      duration,
      outputCount,
      modelId: currentModelId,
      modelName: currentModels.find(m => m.id === currentModelId)?.name ?? "",
      purposeTagId,
      purposeTagName: purposeTags.find(t => t.id === purposeTagId)?.name ?? "",
      referenceUrl: null,
      // 025 · M5 P1 波 3:"其他"时带 note,非"其他"必为空(避免脏数据)
      otherNote: isOther ? otherNote.trim().slice(0, 20) : ""
    };
  }

  function buildFeedItem(api: ApiSuccess, fallback: PendingTask): FeedItem {
    return {
      id: api.task_id,
      type: api.type,
      status: "succeeded",
      prompt: fallback.prompt,
      ratio: fallback.ratio,
      duration_seconds: api.type === "video" ? fallback.duration : null,
      model_name: fallback.modelName,
      purpose_tag_name: fallback.purposeTagName,
      created_at: new Date().toISOString(),
      file_url: api.file_url ?? null,
      file_type: api.file_type ?? null,
      outputs: api.outputs,
      credits_cost: api.credits_cost ?? null,
      reference_image_url: api.reference_image_url ?? null
    };
  }

  // ─── 提交生成 — 表单入口:校验 + 构 ctx + 调 runGeneration
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) {
      setError("请输入 prompt");
      return;
    }
    if (!currentModelId) {
      setError(`当前没有可用的${isVideo ? "视频" : "图片"}模型`);
      return;
    }
    // 024 · M5 P1 波 2:主标签必选 blocking(D16 DM5.9)
    // 会话首次生成前必须在头部 chip 选主标签 ParamSelect 的 required HTML 校验在波 3 去掉
    if (!props.primaryPurposeTagId) {
      setError("请先在会话头部选择主标签");
      return;
    }
    setError(null);
    setDockMaximized(false); // 提交时关闭放大编辑 modal,让用户看到 skeleton/结果
    setDockExpanded(false);  // 提交时折叠 dock,腾位置给 skeleton/结果
    await runGeneration(buildPending(), referenceImage?.dataUrl);
    // 025 · M5 P1 波 3:pending 已发出,reset note state(ctx 持有原值,重试不丢)
    setOtherNote("");
  }

  // 实际跑生成 — 可重入(失败重试调用同一函数);ctx 自包含所有参数,
  // 不依赖顶层 state(避免重试时 state stale 的闭包陷阱)
  async function runGeneration(ctx: PendingTask, refDataUrl?: string) {
    writePending(ctx);
    scrollFeedToBottom();

    try {
      const endpoint = ctx.kind === "video" ? "/api/generate/video" : "/api/generate/image";
      const body: Record<string, unknown> = {
        model_id: ctx.modelId,
        prompt: ctx.prompt,
        ratio: ctx.ratio,
        purpose_tag_id: ctx.purposeTagId,
        conversation_id: props.conversationId
      };
      if (ctx.kind === "video") body.duration_seconds = ctx.duration;
      if (refDataUrl) body.reference_image_url = refDataUrl;
      if (ctx.kind === "image" && ctx.outputCount !== 1) body.output_count = ctx.outputCount;
      // 025 · M5 P1 波 3:"其他" optional note(<20 字,仅 isOther 时带)
      if (ctx.otherNote && ctx.otherNote.length > 0) body.other_note = ctx.otherNote;

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      // 防御:5xx 时上游可能返回空 body / HTML,resp.json() 会抛 SyntaxError
      let data: ApiSuccess | ApiFailure;
      try {
        data = await resp.json();
      } catch {
        const text = await resp.text().catch(() => "");
        failPending(text || `服务异常 (HTTP ${resp.status})`);
        return;
      }
      if (!resp.ok || "error" in data) {
        failPending("error" in data ? data.error.message : "未知错误");
        return;
      }

      if (data.status === "succeeded" && data.file_url) {
        // 2026-05-28 起 image/video 都异步,正常不会进这里;保留作为防御,极少数同步成功路径兼容
        if (data.quota_warning) setQuotaWarning(data.quota_warning);
        if (data.used_credits_after != null) setUsedCredits(data.used_credits_after);
        const item = buildFeedItem(data, ctx);
        writeFeed(prev => [...prev, item]);
        setLatestTaskId(item.id);
        writePending(null);
        // 2026-05-29 反馈:同上,不自动折叠 dock
        router.refresh();
      } else if (data.status === "running") {
        // 异步:image (/v1/images background) + video (/v1/videos),都走 task_id 轮询路径,
        // 参考图 URL 从 running 响应带入 pending,轮询完成时建 FeedItem 用
        writePending({ ...ctx, taskId: data.task_id, referenceUrl: data.reference_image_url ?? null });
      } else if (data.status === "failed") {
        failPending(data.error_message ?? "生成失败");
      }
    } catch (e) {
      failPending((e as Error).message);
    }
  }

  // 失败:把错误注入到 pending 卡片(不清 pending),SkeletonResult 会切到红框 + 关闭/重试
  function failPending(message: string) {
    writePending(prev => prev ? { ...prev, errorMessage: message } : null);
  }

  // 失败卡 → 重试:用 pending 自带 ctx 重提(去掉 errorMessage / taskId,重置成 fresh ctx);
  // 参考图:state 里 referenceImage 还在就带,跨页面回来已丢则降级为无参考图重试
  function onPendingRetry() {
    if (!pending) return;
    const ctx: PendingTask = {
      ...pending,
      taskId: null,
      referenceUrl: null,
      errorMessage: undefined
    };
    void runGeneration(ctx, referenceImage?.dataUrl);
  }

  // 失败卡 → 关闭:清掉占位卡(failed task 在后端已记 status=failed,资产库本就不展示)
  function onPendingDismiss() {
    writePending(null);
  }

  function scrollFeedToBottom(smooth = true) {
    // 2026-05-29 V1 加 B 修复:单次 setTimeout 60ms 时 React 可能尚未 commit DOM
    // (新 SkeletonResult 未挂载,scrollHeight 是旧值)。改 rAF 多次重试 + 末尾 100ms 兜底,
    // 确保 smooth 动画结束后 scroll 落到最终 bottom(看到 SkeletonResult)。
    const tryOnce = () => {
      const el = feedScrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    };
    requestAnimationFrame(() => {
      tryOnce();
      requestAnimationFrame(() => {
        tryOnce();
        setTimeout(tryOnce, 120);
      });
    });
  }

  // 2026-05-29 V1 加 B:新 pending 出现时(用户提交后)自动滚到底,看到 SkeletonResult
  // 仅在 pending 从 null → 非 null 时滚(用 ref 记上次状态),避免 errorMessage 等字段变化也滚
  const hadPendingRef = useRef(false);
  useEffect(() => {
    const has = pending !== null;
    if (has && !hadPendingRef.current) {
      scrollFeedToBottom();
    }
    hadPendingRef.current = has;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // 监听 feed 滚动：触底 → dock 自动展开；离开底部 → 自动折叠
  // hysteresis（迟滞）：进入 atBottom 阈值 8，离开 32 —— 解决到底部回弹时反复抖动
  // 用 rAF 节流避免高频 setState
  useEffect(() => {
    const el = feedScrollRef.current;
    if (!el) return;
    let raf = 0;
    // 用 ref 记当前态而不是闭包 atBottom（避免 effect 依赖 atBottom 重建）
    let currentAtBottom = true;
    const check = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      // 双阈值迟滞：在 [8, 64] 区间内不切换，避免回弹抖动反复触发
      // 64 是经验值：dock 切换会让 scrollHeight 跳 ~40-60，需要大于这个差才稳
      const next = currentAtBottom ? dist <= 64 : dist <= 8;
      if (next === currentAtBottom) return;
      currentAtBottom = next;
      setAtBottom(next);
      // 双向联动:触底自动展开 + 离开底自动收起。hysteresis(进入 64 / 离开 8)防抖
      setDockExpanded(next);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    };
    check();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => onScroll());
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [feedItems.length]);

  // ─── 异步任务轮询(image/video 统一,2026-05-28 image 也走 background)
  useEffect(() => {
    if (!pending?.taskId) return;
    // stopped:effect 已终止(cleanup 触发 或 已拿到终态)
    //   `/api/tasks/{id}` 可能比 3s 慢(后端要回查 easyrouter),多个轮询请求会并行;
    //   clearInterval 只停后续 tick,已在飞行中的请求仍会回来 —— 必须在每次 await 后
    //   重新校验 stopped,否则多个请求都拿到 succeeded 会重复 append(曾导致结果重复 2-3 段)。
    // inFlight:上一次轮询请求未结束就不发下一次,避免慢请求堆叠。
    let stopped = false;
    let inFlight = false;
    const ctx = pending; // capture
    const timer = setInterval(async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const resp = await fetch(`/api/tasks/${ctx.taskId}`);
        if (stopped) return;
        if (!resp.ok) return;
        const data: TaskPoll = await resp.json();
        if (stopped) return;
        if (data.status === "succeeded" && data.file_url) {
          stopped = true;
          clearInterval(timer);
          const item: FeedItem = {
            id: data.id,
            type: data.type,
            status: "succeeded",
            prompt: ctx.prompt,
            ratio: ctx.ratio,
            duration_seconds: data.type === "video" ? ctx.duration : null,
            model_name: ctx.modelName,
            purpose_tag_name: ctx.purposeTagName,
            created_at: new Date().toISOString(),
            file_url: data.file_url,
            file_type: data.file_type ?? null,
            outputs: data.outputs,
            credits_cost: data.credits_cost ?? null,
            reference_image_url: ctx.referenceUrl
          };
          writeFeed(prev => [...prev, item]); // newest 追加到末尾
          setLatestTaskId(item.id);
          writePending(null);
          // 2026-05-29 反馈:删除"生成完成 → 自动折叠 dock"。dock 状态独立于 task,
          // 仅由 user 主动操作 + 提交时折叠 + 触底自动展开控制
          if (data.credits_cost != null) setUsedCredits(c => c + (data.credits_cost ?? 0));
          router.refresh();
        } else if (data.status === "failed") {
          stopped = true;
          clearInterval(timer);
          failPending(data.error_message ?? "生成失败");
        } else if (data.status === "cancelled") {
          stopped = true;
          clearInterval(timer);
          writePending(null);
        }
      } catch {
        // 静默吞,下一轮再试
      } finally {
        inFlight = false;
      }
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pending, router]);

  // 注:不提供"停止生成"按钮 — 请求一旦发出,上游 LLM/视频服务已经开始计费(image 同步)
  // 或已经入队列(video 异步),前端 abort 只断 client 连接,后端继续跑完 + 扣积分。
  // 给用户"能停止"的按钮会造成"能省钱"的错觉,实际省不了。pending 卡只能等结果。

  function handleReferenceUpload(file: File) {
    setError(null);
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError("仅支持 PNG / JPEG / WebP");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError(`图片太大(${(file.size / 1024 / 1024).toFixed(1)} MB),需 ≤ 20 MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      writeReference({
        dataUrl: reader.result as string,
        name: file.name,
        size: file.size
      });
    };
    reader.onerror = () => setError("读取图片失败");
    reader.readAsDataURL(file);
  }

  // 从已生成素材的 URL 设为参考图(资产面板「设为参考图」快捷键)— 拉图转 data URL
  async function handleSetReferenceFromUrl(url: string) {
    setError(null);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("fetch failed");
      const blob = await resp.blob();
      if (blob.size > 20 * 1024 * 1024) {
        setError("图片太大,需 ≤ 20 MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        writeReference({ dataUrl: reader.result as string, name: "历史素材", size: blob.size });
        setAssetPanelOpen(false);
      };
      reader.onerror = () => setError("读取素材失败");
      reader.readAsDataURL(blob);
    } catch {
      setError("设为参考图失败,请重试");
    }
  }

  // ─── 重新生成 — 把 feed 项的参数加载回 dock(参考图无法恢复,要用户重新上传)
  function onReuse(item: FeedItem) {
    if (item.type === "image" || item.type === "video") setKind(item.type);
    writePrompt(item.prompt);
    if ((RATIOS as readonly string[]).includes(item.ratio)) {
      const r = item.ratio as Ratio;
      // 视频项若带非视频比例(老数据),回退 16:9
      setRatio(item.type === "video" && !(VIDEO_RATIOS as readonly string[]).includes(r) ? "16:9" : r);
    }
    const pool = item.type === "video" ? props.videoModels : props.imageModels;
    const m = pool.find(x => x.name === item.model_name);
    if (m) {
      if (item.type === "video") setVideoModelId(m.id);
      else setImageModelId(m.id);
    }
    const t = props.purposeTags.find(t => t.name === item.purpose_tag_name);
    if (t) setPurposeTagId(t.id);
    if (item.duration_seconds === 5 || item.duration_seconds === 10) {
      setDuration(item.duration_seconds);
    }
    if (item.outputs && item.outputs.length > 0) {
      const n = item.outputs.length;
      if (n === 1 || n === 2 || n === 4) setOutputCount(n);
    }
    // 重新生成 — 把参数加载回 dock 并展开;dock 常驻底部,展开即在原位,不滚动 feed
    setDockExpanded(true);
  }

  // "清空页面" — 2026-05-29 V1 加 B:语义改为"创建新对话",对齐 ConversationsPanel +新对话
  // POST /api/conversations 创建空 conv → router.push 跳过去,page.tsx SSR 自动拉空 feed + hero 态
  // 创建失败时 silent(用户可重试)
  async function onClearPage() {
    writePending(null);
    setError(null);
    try {
      const r = await fetch("/api/conversations", { method: "POST" });
      if (!r.ok) return;
      const data = (await r.json()) as { conversation: { id: string } };
      router.push(`/?conversation_id=${data.conversation.id}&kind=${kind}`);
    } catch {
      /* 网络错误:silent,用户可重试 */
    }
  }

  // 切换图片/视频 — 切到视频时,若当前比例不在视频支持的 3 个里(16:9/1:1/9:16),回退 16:9
  function handleKindChange(next: Kind) {
    setKind(next);
    if (next === "video" && !(VIDEO_RATIOS as readonly string[]).includes(ratio)) {
      setRatio("16:9");
    }
  }

  // limited 图片模型(gpt-image-* / aihubmix)只支持 1:1/3:4/4:3,UI 已过滤选项
  // 但模型/ratio 通过别的路径变化(切模型/重用历史/prefill)时,state 里可能留下 9:16/16:9
  // → 这里集中兜底,自动映射回等价值(9:16 → 3:4,16:9 → 4:3)
  useEffect(() => {
    if (kind !== "image") return;
    const m = props.imageModels.find(x => x.id === imageModelId);
    if (!m || getRatioSupport(m) !== "limited") return;
    const mapped = effectiveRatio(m, ratio) as Ratio;
    if (mapped !== ratio) setRatio(mapped);
  }, [kind, imageModelId, ratio, props.imageModels]);

  const ratioUsed = usedCredits / Math.max(props.initialLimitCredits, 1);
  const computedWarning: "green" | "yellow" | "red" =
    quotaWarning === "red" || ratioUsed >= 1
      ? "red"
      : quotaWarning === "yellow" || ratioUsed >= 0.8
        ? "yellow"
        : "green";

  const noModels = currentModels.length === 0;
  const hasResults = feedItems.length > 0 || pending !== null || error !== null;

  // ─── dock props 共享
  const dockProps = {
    kind,
    prompt,
    ratio,
    purposeTagId,
    purposeTags,
    primaryPurposeTagId: props.primaryPurposeTagId,
    // 025 · M5 P1 波 3:override 视觉 + "其他" input 数据
    otherPurposeTagId: props.otherPurposeTagId,
    otherNote,
    onOtherNoteChange: setOtherNote,
    currentModels,
    currentModelId,
    referenceImage,
    outputCount,
    duration,
    // 失败态(pending.errorMessage 非空)按钮不再 loading — 用户可以直接点提交开始新一轮,
    // 旧的失败 pending 卡会被 runGeneration 里的 writePending(新 ctx) 自动覆盖替换
    loading: pending !== null && !pending.errorMessage,
    noModels,
    newTagInputOpen,
    newTagDraft,
    newTagSubmitting,
    newTagError,
    usedCredits,
    limitCredits: props.initialLimitCredits,
    quotaWarning: computedWarning,
    onSubmit,
    onKindChange: handleKindChange,
    onPromptChange: writePrompt,
    onRatioChange: setRatio,
    onPurposeTagChange: setPurposeTagId,
    onModelChange: (modelId: string) => {
      if (kind === "video") setVideoModelId(modelId);
      else setImageModelId(modelId);
    },
    onReferenceUpload: handleReferenceUpload,
    onReferenceRemove: () => writeReference(null),
    onOutputCountChange: setOutputCount,
    onDurationChange: setDuration,
    onClear: () => {
      writePrompt("");
      setError(null);
      writeReference(null);
    },
    onCreateTag: handleCreateTag,
    onNewTagDraftChange: setNewTagDraft,
    onNewTagInputOpenChange: setNewTagInputOpen,
    onNewTagErrorClear: () => setNewTagError(null),
    onToggleMaximize: () => setDockMaximized(m => !m)
  };

  // ─── Esc 关闭放大编辑 modal
  useEffect(() => {
    if (!dockMaximized) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDockMaximized(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [dockMaximized]);

  return (
    <>
      {/* 024 · M5 P1 波 2:root 高度从 h-[calc(100vh-56px)] 改 h-full,父容器(page.tsx)负责减去 ConversationHeader strip */}
      <div className="flex flex-col h-full min-h-0">
        {hasResults ? (
          <DockedLayout
            kind={kind}
            feedItems={feedItems}
            pending={pending}
            error={error}
            latestTaskId={latestTaskId}
            feedScrollRef={feedScrollRef}
            collectionMap={props.initialCollectionMap}
            onReuse={onReuse}
            onPendingRetry={onPendingRetry}
            onPendingDismiss={onPendingDismiss}
            onErrorDismiss={() => setError(null)}
            onClearPage={onClearPage}
            onOpenHistory={() => setAssetPanelOpen(true)}
            dockExpanded={dockExpanded}
            onDockExpand={() => setDockExpanded(true)}
            onDockCollapse={() => setDockExpanded(false)}
            atBottom={atBottom}
            onBackToBottom={() => {
              scrollFeedToBottom();
              setDockExpanded(true);
            }}
            dockProps={dockProps}
          />
        ) : (
          <HeroLayout dockProps={dockProps} />
        )}
      </div>

      {/* Maximize 模态 — 全屏 overlay,长 prompt 易看易编辑 */}
      {dockMaximized && (
        <div
          className="fixed inset-0 z-40 grid place-items-center p-6 animate-fade-in"
          style={{ background: "rgba(15,18,28,.55)", backdropFilter: "blur(4px)" }}
          onClick={() => setDockMaximized(false)}
        >
          <div
            className="w-full max-w-[1080px] h-[calc(100vh-96px)] max-h-[860px] animate-zoom-in"
            onClick={e => e.stopPropagation()}
          >
            <GenerationDock variant="maximized" {...dockProps} />
          </div>
        </div>
      )}

      {/* 资产面板抽屉 — 点「生成历史」打开 */}
      {assetPanelOpen && (
        <AssetPanel
          sessionItems={feedItems}
          onClose={() => setAssetPanelOpen(false)}
          onSetReference={handleSetReferenceFromUrl}
        />
      )}
    </>
  );
}

type DockProps = Omit<React.ComponentProps<typeof GenerationDock>, "variant">;

// ─── Hero layout(未生成 — 居中大卡)
function HeroLayout({ dockProps }: { dockProps: DockProps }) {
  return (
    <div className="flex-1 grid place-items-center px-6 py-10 overflow-y-auto">
      <div className="w-full max-w-[840px]">
        <div className="text-center mb-6">
          <h1 className="text-[28px] leading-[36px] font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-primary via-violet to-violet bg-clip-text text-transparent">
              开始创作
            </span>
          </h1>
          <p className="text-text-2 mt-2">写一句话描述你想生成的画面,结果会自动入库供二次复用</p>
        </div>

        <GenerationDock variant="hero" {...dockProps} />
      </div>
    </div>
  );
}

// ─── Docked layout(已生成 / 有历史)— feed 在上、dock 常驻底部
//   - feed 是独立滚动区,占满 dock 以上的空间
//   - dock 钉在视口底部,不随 feed 滚动(collapsed 默认 / 点击展开为完整输入)
//   - 新结果落地后 feed 自动滚到底部
function DockedLayout({
  kind,
  feedItems,
  pending,
  error,
  latestTaskId,
  feedScrollRef,
  collectionMap,
  onReuse,
  onPendingRetry,
  onPendingDismiss,
  onErrorDismiss,
  onClearPage,
  onOpenHistory,
  dockExpanded,
  onDockExpand,
  onDockCollapse,
  atBottom,
  onBackToBottom,
  dockProps
}: {
  kind: Kind;
  feedItems: FeedItem[];
  pending: PendingTask | null;
  error: string | null;
  latestTaskId: string | null;
  feedScrollRef: React.RefObject<HTMLDivElement>;
  collectionMap: Record<string, number>;
  onReuse: (item: FeedItem) => void;
  onPendingRetry: () => void;
  onPendingDismiss: () => void;
  onErrorDismiss: () => void;
  onClearPage: () => void;
  onOpenHistory: () => void;
  dockExpanded: boolean;
  onDockExpand: () => void;
  onDockCollapse: () => void;
  atBottom: boolean;
  onBackToBottom: () => void;
  dockProps: DockProps;
}) {
  // dock 悬浮在 feed 之上 — 测量 dock 实际高度,给 feed 撑出底部留白,
  // 保证最后一条结果能滚到 dock 上方完整可见(不被悬浮 dock 永久遮住)
  // 2026-05-27 修复"展开/折叠切换导致 scroll 抖动"：
  //   dockHeight 用 Math.max 历史峰值（永不缩小）→ feed 总高度稳定
  //   → atBottom 计算不被 dock 状态变化扰动 → 不再"回弹反复跳出"
  const dockRef = useRef<HTMLDivElement | null>(null);
  // 默认按展开态预估 280（贴近实际展开 dock 的高度，避免初次估值过大造成留白过多）
  const [dockHeight, setDockHeight] = useState(280);
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      if (h > 0) setDockHeight((prev) => Math.max(prev, h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex-1 min-h-0 relative">
      {/* 右上角悬浮控件 — 资产库(2026-05-29 V1 加 B:删"新会话",ConversationsPanel 已有 +新对话;"生成历史"→"资产库") */}
      <div className="absolute top-4 right-6 z-20 flex items-center bg-card border border-text-3 rounded-lg shadow-md overflow-hidden">
        <button
          type="button"
          onClick={onOpenHistory}
          title="浏览本次会话 / 全部历史的生成素材"
          className="h-9 px-3.5 inline-flex items-center gap-1.5 text-sub text-text-2 hover:bg-bg hover:text-text transition"
        >
          <HistoryIcon />
          资产库
        </button>
      </div>

      {/* feed 滚动区 — 铺满整个区域;内容从悬浮 dock 背后滚过
          dockHeight 是历史峰值（永不缩小），+ 40 间距 → 展开态约 60-70px 真实间距 */}
      <div
        ref={feedScrollRef}
        className="absolute inset-0 overflow-y-auto px-6 pt-14"
      >
        {/* min-h-full + flex justify-end:feed 内容贴近 dock(避免 1 个 SkeletonResult 漂在顶部+下方大空白) */}
        <div className="max-w-[920px] mx-auto min-h-full flex flex-col justify-end" style={{ paddingBottom: dockHeight + 40 }}>
          {/* feed items — 按日期分组,日期标题代替原"图片生成"标题(newest 在末尾) */}
          {groupFeedByDate(feedItems).map((g, gi) => (
            <div key={g.key} className={gi > 0 ? "mt-7" : ""}>
              <h2 className="text-h1 text-text num mb-3">{g.label}</h2>
              <div className="space-y-4">
                {g.items.map(item => (
                  <ResultFeedItem
                    key={item.id}
                    item={item}
                    collectionId={collectionMap[item.id] ?? null}
                    onReuse={onReuse}
                    isLatest={item.id === latestTaskId}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* pending skeleton — feed 末尾紧接 */}
          {pending && (
            <div className={feedItems.length > 0 ? "mt-4" : ""}>
              <SkeletonResult
                kind={pending.kind}
                ratio={pending.ratio}
                count={pending.outputCount}
                durationSeconds={pending.duration}
                modelName={pending.modelName}
                prompt={pending.prompt}
                purposeTagName={pending.purposeTagName}
                taskId={pending.taskId}
                errorMessage={pending.errorMessage}
                onRetry={pending.errorMessage ? onPendingRetry : undefined}
                onDismiss={pending.errorMessage ? onPendingDismiss : undefined}
              />
            </div>
          )}

          {feedItems.length === 0 && !pending && !error && (
            <div className="text-center text-text-3 text-sub py-10">
              开始你的第一次生成
            </div>
          )}
        </div>
      </div>

      {/* dock — 悬浮在 feed 之上(absolute,不占文档流),feed 内容从它背后滚过;
          收窄到 720;切换折叠/展开时整块走 dock-pop 缩放动效(key 变化触发重放) */}
      {/* 错误提示 — 浮在 dock 上方（贴近用户视野，不再藏在 feed 顶部）
          admin 滚到底部生成时如果失败，提示就在眼前 */}
      {error && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-6 pointer-events-none" style={{ paddingBottom: dockHeight + 28 }}>
          <div
            className={
              "mx-auto pointer-events-auto bg-danger-soft text-danger border border-danger/30 rounded-lg px-3.5 py-2.5 text-sub flex items-start justify-between gap-3 shadow-md " +
              (dockExpanded ? "max-w-[720px]" : "max-w-[560px]")
            }
            role="alert"
            style={{ animation: "dock-pop .2s ease-out" }}
          >
            <span className="leading-relaxed">{error}</span>
            <button
              type="button"
              onClick={onErrorDismiss}
              className="text-danger/70 hover:text-danger shrink-0"
              title="关闭"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-5 left-0 right-0 z-10 px-6 pointer-events-none">
        <div
          ref={dockRef}
          className={
            "mx-auto pointer-events-auto transition-[max-width] duration-200 " +
            (dockExpanded ? "max-w-[720px]" : "max-w-[560px]")
          }
        >
          <div key={dockExpanded ? "expanded" : "collapsed"} className="animate-dock-pop">
            {dockExpanded ? (
            <GenerationDock variant="docked" {...dockProps} onMinimize={onDockCollapse} />
          ) : (
            <CollapsedDock
              kind={dockProps.kind}
              prompt={dockProps.prompt}
              ratio={dockProps.ratio}
              outputCount={dockProps.outputCount}
              duration={dockProps.duration}
              currentModels={dockProps.currentModels}
              currentModelId={dockProps.currentModelId}
              purposeTags={dockProps.purposeTags}
              purposeTagId={dockProps.purposeTagId}
              referenceImage={dockProps.referenceImage}
              loading={dockProps.loading}
              noModels={dockProps.noModels}
              usedCredits={dockProps.usedCredits}
              limitCredits={dockProps.limitCredits}
              quotaWarning={dockProps.quotaWarning}
              onSubmit={dockProps.onSubmit}
              onExpand={onDockExpand}
              onReferenceUpload={dockProps.onReferenceUpload}
              onReferenceRemove={dockProps.onReferenceRemove}
              showBackToBottom={!atBottom}
              onBackToBottom={onBackToBottom}
            />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function NewSessionIcon() {
  // 新会话 — 加号 + 对话气泡，区别于"清空"语义（无破坏意味，强调"开新"）
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 4v-4H6a2 2 0 0 1-2-2z" />
      <path d="M12 7v6M9 10h6" />
    </svg>
  );
}
