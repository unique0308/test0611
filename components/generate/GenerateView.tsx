"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent,
  type DragEvent
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ModelRow, PurposeTagRow } from "@/lib/db/queries";
import { Icon } from "@/components/ui/icons";
import { Lightbox, type LightboxSource } from "@/components/ui/primitives";
import {
  RATIOS,
  VIDEO_RATIOS,
  ratioToAspectClass,
  type FeedItem,
  type Kind,
  type Ratio,
  type ReferenceImage
} from "./types";

// V2 创作视图（来源：原型设计V2/_extract/src/view-generate.jsx）
// - 双态：未生成 → .gen-hero（大标题 + 起步 prompt）；已生成 → .gen-feed（会话 feed）
// - 底部浮动 .dock：image/video 切换 pill + prompt textarea + 参考图缩略 + 参数行 + 生成按钮
// - 保留 ai-platform 现有 API 契约：POST /api/generate/{image,video}、GET /api/tasks/:id、POST /api/purpose-tags、?prefill=…
// - 保留 sessionStorage 会话 feed（跨刷新/切页保留）
// TODO（V2 暂不实现，可后续补）：dock maximize 模态、资产抽屉、收藏 API、cancel pending

type Props = {
  imageModels: ModelRow[];
  videoModels: ModelRow[];
  purposeTags: PurposeTagRow[];
  defaultPurposeTagId: string;
  initialUsedCredits: number;
  initialLimitCredits: number;
  initialFeedItems: FeedItem[];
  initialCollectionMap: Record<string, number>;
  userId: string;
};

interface ApiSuccess {
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
}

interface ApiFailure {
  error: { code: string; message: string };
}

interface TaskPoll {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  type: Kind;
  file_url?: string;
  file_type?: string;
  outputs?: Array<{ file_url: string; file_type: string; output_index: number }>;
  credits_cost?: number | null;
  cost_cny?: number | null;
  error_message?: string | null;
}

interface PendingTask {
  taskId: string | null;
  kind: Kind;
  prompt: string;
  ratio: Ratio;
  duration: 5 | 10;
  outputCount: 1 | 2 | 4;
  modelName: string;
  purposeTagName: string;
  referenceUrl: string | null;
}

const FEED_STORAGE_KEY = "generate:session-feed";

const STARTER_PROMPTS_IMAGE = [
  "为新品发布做一张科技感封面图",
  "极简产品摄影 · 留白构图",
  "抽象品牌视觉 · 渐变与几何",
  "为公众号 3 月专题做 4 张配图",
  "海报设计 · 大字标题 + 渐变背景"
];

const STARTER_PROMPTS_VIDEO = [
  "15s 产品短片 · 镜头从特写拉远",
  "运镜：俯拍 → 平移 · 自然光",
  "极简动效 · 文字呼吸感入场",
  "卡通风格 · 角色挥手特写",
  "建筑空间漫游 · 暖色光"
];

export function GenerateView(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialKind: Kind = searchParams?.get("kind") === "video" ? "video" : "image";

  // ─── 业务 state ─────────────────────────────────────────────
  const [kind, setKind] = useState<Kind>(initialKind);
  const isVideo = kind === "video";

  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<Ratio>("3:4");
  const [purposeTagId, setPurposeTagId] = useState(props.defaultPurposeTagId);

  const [imageModelId, setImageModelId] = useState(
    props.imageModels.find((m) => m.is_baseline)?.id ?? props.imageModels[0]?.id ?? ""
  );
  const [videoModelId, setVideoModelId] = useState(
    props.videoModels.find((m) => m.is_baseline)?.id ?? props.videoModels[0]?.id ?? ""
  );
  const [duration, setDuration] = useState<5 | 10>(5);
  const [outputCount, setOutputCount] = useState<1 | 2 | 4>(1);

  const [purposeTags, setPurposeTags] = useState<PurposeTagRow[]>(props.purposeTags);
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);

  const [feedItems, setFeedItems] = useState<FeedItem[]>(props.initialFeedItems);
  const [pending, setPending] = useState<PendingTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestTaskId, setLatestTaskId] = useState<string | null>(null);

  const [usedCredits, setUsedCredits] = useState(props.initialUsedCredits);
  const [lightbox, setLightbox] = useState<LightboxSource | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);

  const feedScrollRef = useRef<HTMLDivElement>(null);

  const currentModels = isVideo ? props.videoModels : props.imageModels;
  const currentModelId = isVideo ? videoModelId : imageModelId;
  const currentModelName = currentModels.find((m) => m.id === currentModelId)?.name ?? "";
  const purposeTagName =
    purposeTags.find((t) => t.id === purposeTagId)?.name ?? purposeTags[0]?.name ?? "";

  const availableRatios = isVideo ? VIDEO_RATIOS : RATIOS;
  const hasResults = feedItems.length > 0 || pending !== null;

  // ─── sessionStorage feed 恢复 ───────────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FEED_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { userId?: string; items?: FeedItem[] };
      if (saved.userId === props.userId && Array.isArray(saved.items) && saved.items.length > 0) {
        setFeedItems(saved.items);
      } else if (saved.userId !== props.userId) {
        sessionStorage.removeItem(FEED_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const feedSkip = useRef(true);
  useEffect(() => {
    if (feedSkip.current) {
      feedSkip.current = false;
      return;
    }
    try {
      if (feedItems.length > 0) {
        sessionStorage.setItem(
          FEED_STORAGE_KEY,
          JSON.stringify({ userId: props.userId, items: feedItems })
        );
      } else {
        sessionStorage.removeItem(FEED_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [feedItems, props.userId]);

  // ─── ?prefill=… 加载参数（来自 /assets 等"重新生成"链接） ───
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
      if (payload.prompt) setPrompt(payload.prompt);
      if (payload.ratio && (RATIOS as readonly string[]).includes(payload.ratio))
        setRatio(payload.ratio);
      if (payload.model_name) {
        const pool = payload.type === "video" ? props.videoModels : props.imageModels;
        const m = pool.find((x) => x.name === payload.model_name);
        if (m) {
          if (payload.type === "video") setVideoModelId(m.id);
          else setImageModelId(m.id);
        }
      }
      if (payload.purpose_tag_name) {
        const t = props.purposeTags.find((t) => t.name === payload.purpose_tag_name);
        if (t) setPurposeTagId(t.id);
      }
      if (payload.duration_seconds === 5 || payload.duration_seconds === 10) {
        setDuration(payload.duration_seconds);
      }
      router.replace("/");
    } catch {
      /* ignore */
    }
  }, [props.imageModels, props.videoModels, props.purposeTags, router, searchParams]);

  // ─── 切 image/video 时校验 ratio ───────────────────────────
  function handleKindChange(next: Kind) {
    setKind(next);
    if (next === "video" && !(VIDEO_RATIOS as readonly string[]).includes(ratio)) {
      setRatio("16:9");
    }
    if (next === "image") {
      setOutputCount(1);
    }
  }

  // ─── 估算成本（粗略，与现有 GenerateCore 风格保持一致） ───
  const estimateCost = useMemo(() => {
    if (isVideo) return duration === 10 ? 160 : 80;
    const perModel = currentModelName.includes("Flux")
      ? 12
      : currentModelName.includes("Midjourney")
        ? 8
        : 3;
    return perModel * outputCount;
  }, [isVideo, duration, currentModelName, outputCount]);

  // ─── 提交生成 ──────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (!prompt.trim()) {
      setError("请输入 prompt");
      return;
    }
    if (!currentModelId) {
      setError(`当前没有可用的${isVideo ? "视频" : "图片"}模型`);
      return;
    }
    setError(null);
    const ctx: PendingTask = {
      taskId: null,
      kind,
      prompt: prompt.trim(),
      ratio,
      duration,
      outputCount,
      modelName: currentModelName,
      purposeTagName,
      referenceUrl: null
    };
    setPending(ctx);
    setTimeout(() => feedScrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }), 60);

    try {
      const endpoint = isVideo ? "/api/generate/video" : "/api/generate/image";
      const body: Record<string, unknown> = {
        model_id: currentModelId,
        prompt: prompt.trim(),
        ratio,
        purpose_tag_id: purposeTagId
      };
      if (isVideo) body.duration_seconds = duration;
      if (referenceImage) body.reference_image_url = referenceImage.dataUrl;
      if (!isVideo && outputCount !== 1) body.output_count = outputCount;

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await resp.json()) as ApiSuccess | ApiFailure;
      if (!resp.ok || "error" in data) {
        setError("error" in data ? data.error.message : "未知错误");
        setPending(null);
        return;
      }
      if (data.status === "succeeded" && data.file_url) {
        if (data.used_credits_after != null) setUsedCredits(data.used_credits_after);
        const item: FeedItem = {
          id: data.task_id,
          type: data.type,
          status: "succeeded",
          prompt: ctx.prompt,
          ratio: ctx.ratio,
          duration_seconds: data.type === "video" ? ctx.duration : null,
          model_name: ctx.modelName,
          purpose_tag_name: ctx.purposeTagName,
          created_at: new Date().toISOString(),
          file_url: data.file_url ?? null,
          file_type: data.file_type ?? null,
          outputs: data.outputs,
          credits_cost: data.credits_cost ?? null,
          reference_image_url: data.reference_image_url ?? null
        };
        setFeedItems((prev) => [...prev, item]);
        setLatestTaskId(item.id);
        setPending(null);
        setPrompt("");
        setReferenceImage(null);
        router.refresh();
      } else if (data.status === "running") {
        setPending({ ...ctx, taskId: data.task_id, referenceUrl: data.reference_image_url ?? null });
      } else if (data.status === "failed") {
        setError(data.error_message ?? "生成失败");
        setPending(null);
      }
    } catch (e) {
      setError((e as Error).message);
      setPending(null);
    }
  }, [
    prompt,
    currentModelId,
    currentModelName,
    purposeTagName,
    isVideo,
    kind,
    ratio,
    duration,
    outputCount,
    purposeTagId,
    referenceImage,
    router
  ]);

  // ─── 视频异步轮询 ──────────────────────────────────────────
  useEffect(() => {
    if (!pending?.taskId) return;
    let stopped = false;
    let inFlight = false;
    const ctx = pending;
    const timer = setInterval(async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const resp = await fetch(`/api/tasks/${ctx.taskId}`);
        if (stopped || !resp.ok) return;
        const data = (await resp.json()) as TaskPoll;
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
            file_url: data.file_url ?? null,
            file_type: data.file_type ?? null,
            outputs: data.outputs,
            credits_cost: data.credits_cost ?? null,
            reference_image_url: ctx.referenceUrl
          };
          setFeedItems((prev) => [...prev, item]);
          setLatestTaskId(item.id);
          setPending(null);
          setPrompt("");
          setReferenceImage(null);
          if (data.credits_cost != null) setUsedCredits((c) => c + (data.credits_cost ?? 0));
          router.refresh();
        } else if (data.status === "failed") {
          stopped = true;
          clearInterval(timer);
          setError(data.error_message ?? "生成失败");
          setPending(null);
        } else if (data.status === "cancelled") {
          stopped = true;
          clearInterval(timer);
          setPending(null);
        }
      } catch {
        /* retry */
      } finally {
        inFlight = false;
      }
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pending, router]);

  // ─── 参考图上传 ──────────────────────────────────────────────
  function readReferenceFile(file: File) {
    setError(null);
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError("仅支持 PNG / JPEG / WebP");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError(`图片太大(${(file.size / 1024 / 1024).toFixed(1)} MB)，需 ≤ 20 MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setReferenceImage({
        dataUrl: reader.result as string,
        name: file.name,
        size: file.size
      });
    reader.onerror = () => setError("读取图片失败");
    reader.readAsDataURL(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readReferenceFile(file);
  }

  // ─── 重新生成 ──────────────────────────────────────────────
  function onReuse(item: FeedItem) {
    if (item.type === "image" || item.type === "video") handleKindChange(item.type);
    setPrompt(item.prompt);
    if ((RATIOS as readonly string[]).includes(item.ratio)) {
      const r = item.ratio as Ratio;
      setRatio(item.type === "video" && !(VIDEO_RATIOS as readonly string[]).includes(r) ? "16:9" : r);
    }
    const pool = item.type === "video" ? props.videoModels : props.imageModels;
    const m = pool.find((x) => x.name === item.model_name);
    if (m) {
      if (item.type === "video") setVideoModelId(m.id);
      else setImageModelId(m.id);
    }
    const t = props.purposeTags.find((t) => t.name === item.purpose_tag_name);
    if (t) setPurposeTagId(t.id);
    if (item.duration_seconds === 5 || item.duration_seconds === 10) setDuration(item.duration_seconds);
    if (item.outputs && (item.outputs.length === 1 || item.outputs.length === 2 || item.outputs.length === 4)) {
      setOutputCount(item.outputs.length as 1 | 2 | 4);
    }
  }

  // ─── 新会话 ────────────────────────────────────────────────
  function startNewSession() {
    setFeedItems([]);
    setPending(null);
    setError(null);
    setLatestTaskId(null);
  }

  const sessionCost = feedItems.reduce((s, x) => s + (x.credits_cost ?? 0), 0);

  return (
    <div className="gen-page" data-screen-label="Generate · V2">
      {hasResults ? (
        <div ref={feedScrollRef} className="gen-feed">
          <div className="gen-feed-inner">
            <div className="flex items-center justify-between mb-3" style={{ marginBottom: 16 }}>
              <div>
                <div className="t-h1">本次会话</div>
                <div className="t-sub">
                  {feedItems.length + (pending ? 1 : 0)} 条结果 · 当前会话累计消耗{" "}
                  <span className="num fw-6 text-accent">{sessionCost.toLocaleString("en-US")}</span>{" "}
                  积分
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" onClick={startNewSession}>
                  <Icon name="plus" size={13} /> 新会话
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => router.push("/assets")}
                >
                  <Icon name="folder" size={13} /> 全部资产
                </button>
              </div>
            </div>

            {error && (
              <div
                className="mb-3 t-body fade-in"
                style={{
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid rgba(220,38,38,.22)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12
                }}
              >
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}
                >
                  ×
                </button>
              </div>
            )}

            {feedItems.map((item) => (
              <FeedItemCard
                key={item.id}
                item={item}
                onZoom={setLightbox}
                onReuse={onReuse}
                highlighted={item.id === latestTaskId}
              />
            ))}

            {pending && <PendingCard pending={pending} />}
          </div>
        </div>
      ) : (
        <div className="gen-hero">
          <Icon name="sparkle" size={36} style={{ color: "var(--accent)" }} />
          <div>
            <h1 className="gen-hero-title">{isVideo ? "想做什么视频？" : "今天想生成什么图？"}</h1>
            <p className="gen-hero-sub">
              把想法写在下面的输入框 · 可拖入参考图 · 模型、比例、张数都能调
            </p>
          </div>
          <div className="gen-hero-prompts">
            {(isVideo ? STARTER_PROMPTS_VIDEO : STARTER_PROMPTS_IMAGE).map((p, i) => (
              <div
                key={i}
                className="gen-hero-prompt"
                onClick={() => {
                  setPrompt(p);
                  // 主动触发"已生成"状态：直接 submit 需要用户确认，所以这里只填入 prompt
                }}
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dock */}
      <div className={`dock-wrap ${hasResults ? "feed-mode" : "hero-mode"}`}>
        <div
          className={`dock ${focused ? "focused" : ""} ${dragOver ? "drag-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <DockModeRow
            kind={kind}
            onChange={handleKindChange}
            usedCredits={usedCredits}
            limitCredits={props.initialLimitCredits}
          />

          <textarea
            className="dock-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              isVideo
                ? "描述你想要的视频 · 包括运镜、风格、时长"
                : "描述你想要的图像 · Cmd+Enter 生成 · 可拖入参考图"
            }
            rows={2}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={pending !== null}
          />

          {referenceImage && (
            <div className="dock-refs">
              <div
                className="dock-ref-thumb"
                style={{ backgroundImage: `url(${referenceImage.dataUrl})` }}
              >
                <span className="dock-ref-x" onClick={() => setReferenceImage(null)}>
                  ×
                </span>
              </div>
            </div>
          )}

          <div className="dock-bottom">
            <div className="dock-params">
              <ParamSelect
                icon="layers"
                label="模型"
                value={currentModelId}
                onChange={(v) => {
                  if (isVideo) setVideoModelId(v);
                  else setImageModelId(v);
                }}
                options={currentModels.map((m) => ({ value: m.id, label: m.name }))}
                display={currentModelName || "—"}
              />
              <ParamSelect
                icon="grid"
                label="比例"
                value={ratio}
                onChange={(v) => setRatio(v as Ratio)}
                options={availableRatios.map((r) => ({ value: r, label: r }))}
                display={ratio}
              />
              {!isVideo && (
                <ParamSelect
                  icon="image"
                  label="张数"
                  value={String(outputCount)}
                  onChange={(v) => setOutputCount(Number(v) as 1 | 2 | 4)}
                  options={[
                    { value: "1", label: "1 张" },
                    { value: "2", label: "2 张" },
                    { value: "4", label: "4 张" }
                  ]}
                  display={`${outputCount} 张`}
                />
              )}
              {isVideo && (
                <ParamSelect
                  icon="history"
                  label="时长"
                  value={String(duration)}
                  onChange={(v) => setDuration(Number(v) as 5 | 10)}
                  options={[
                    { value: "5", label: "5 秒" },
                    { value: "10", label: "10 秒" }
                  ]}
                  display={`${duration}s`}
                />
              )}
              <ParamSelect
                icon="tag"
                label="用途"
                value={purposeTagId}
                onChange={setPurposeTagId}
                options={purposeTags.map((t) => ({ value: t.id, label: t.name }))}
                display={purposeTagName || "—"}
              />
              <RefUploadButton onUpload={readReferenceFile} count={referenceImage ? 1 : 0} />
            </div>
            <button
              type="button"
              className="dock-submit"
              onClick={() => void submit()}
              disabled={pending !== null || !prompt.trim() || !currentModelId}
              style={pending !== null || !prompt.trim() || !currentModelId ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              <span className="cost num">≈ {estimateCost} 积分</span>
              <span>{pending ? "生成中…" : "生成"}</span>
              <span className="dock-submit-icon">
                <Icon name={pending ? "refresh" : "arrow"} size={13} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// ─── 子组件：dock 顶部模式切换行 ─────────────────────────────

function DockModeRow({
  kind,
  onChange,
  usedCredits,
  limitCredits
}: {
  kind: Kind;
  onChange: (k: Kind) => void;
  usedCredits: number;
  limitCredits: number;
}) {
  const imageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number }>({ left: 3, width: 0 });

  useEffect(() => {
    const target = kind === "image" ? imageRef.current : videoRef.current;
    const container = containerRef.current;
    if (target && container) {
      const c = container.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      setInd({ left: t.left - c.left, width: t.width });
    }
  }, [kind]);

  const remaining = Math.max(0, limitCredits - usedCredits);

  return (
    <div className="dock-mode-row">
      <div className="dock-mode" ref={containerRef}>
        <div className="dock-mode-ind" style={{ left: ind.left, width: ind.width }} />
        <div
          ref={imageRef}
          className={`dock-mode-pill ${kind === "image" ? "active" : ""}`}
          onClick={() => onChange("image")}
        >
          <Icon name="image" size={13} /> 图片
        </div>
        <div
          ref={videoRef}
          className={`dock-mode-pill ${kind === "video" ? "active" : ""}`}
          onClick={() => onChange("video")}
        >
          <Icon name="video" size={13} /> 视频
        </div>
      </div>
      <div className="flex items-center gap-2" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
        <Icon name="info" size={12} />
        本月剩余{" "}
        <span className="num fw-6" style={{ color: "var(--text-2)" }}>
          {remaining.toLocaleString("en-US")}
        </span>{" "}
        积分
      </div>
    </div>
  );
}

// ─── 子组件：dock 参数选择 chip（用原生 select 简化首版） ───

function ParamSelect({
  icon,
  label,
  value,
  display,
  options,
  onChange
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  display: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  // 原生 select 透明覆盖在 chip 上，UI 不变但下拉用浏览器原生
  return (
    <label className="param" style={{ position: "relative" }}>
      <Icon name={icon} size={12} className="param-icon" />
      <span className="key">{label}</span>
      <span className="val">{display}</span>
      <Icon name="chevDown" size={11} className="chev" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          cursor: "pointer",
          width: "100%",
          height: "100%"
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RefUploadButton({
  onUpload,
  count
}: {
  onUpload: (file: File) => void;
  count: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="param"
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <Icon name="upload" size={12} className="param-icon" />
      <span className="key">参考图</span>
      <span className="val">{count > 0 ? `${count} 张` : "上传"}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── 子组件：feed 项卡片（V2 .feed-item）───────────────────

function FeedItemCard({
  item,
  onZoom,
  onReuse,
  highlighted
}: {
  item: FeedItem;
  onZoom: (s: LightboxSource) => void;
  onReuse: (item: FeedItem) => void;
  highlighted: boolean;
}) {
  const [favorited, setFavorited] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const long = item.prompt.length > 80;

  // outputs 数组优先；fallback file_url
  const outputs =
    item.outputs && item.outputs.length > 0
      ? item.outputs
      : item.file_url
        ? [{ file_url: item.file_url, file_type: item.file_type ?? "", output_index: 0 }]
        : [];
  const n = outputs.length;
  const gridClass = n === 1 ? "n1" : n === 2 ? "n2" : "n4";

  function download(url: string, filename = "asset") {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  return (
    <div className="feed-item fade-in" style={highlighted ? { boxShadow: "var(--accent-shadow)" } : undefined}>
      <div className="flex-1">
        <div className="feed-meta-line">
          <span className="chip chip-soft-accent">
            <Icon name={item.type === "image" ? "image" : "video"} size={11} />
            {item.type === "image" ? "图片" : "视频"}
          </span>
          <span className="chip">{item.model_name}</span>
          <span className="chip">{item.ratio}</span>
          {item.type === "image" && n > 1 && <span className="chip">{n} 张</span>}
          {item.type === "video" && item.duration_seconds && (
            <span className="chip">{item.duration_seconds}s</span>
          )}
          <span className="chip">{item.purpose_tag_name}</span>
          <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>· {formatTs(item.created_at)}</span>
        </div>
        <div className="feed-prompt">
          {long && !expanded ? item.prompt.slice(0, 80) + "…" : item.prompt}
          {long && (
            <span className="more" onClick={() => setExpanded(!expanded)}>
              {expanded ? "收起" : "展开"}
            </span>
          )}
        </div>

        {item.reference_image_url && (
          <div className="feed-refs">
            <span
              className="t-chip"
              style={{
                color: "var(--text-3)",
                display: "inline-flex",
                alignItems: "center",
                marginRight: 2
              }}
            >
              参考
            </span>
            <div
              className="feed-ref"
              style={{ backgroundImage: `url(${item.reference_image_url})` }}
            />
          </div>
        )}

        <div className="feed-bottom-row">
          <button
            type="button"
            className={`icon-btn ${favorited ? "active" : ""}`}
            title="收藏（仅本地标记）"
            onClick={() => setFavorited(!favorited)}
          >
            <Icon name={favorited ? "starFill" : "star"} size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="重新生成（参数加载回 dock）"
            onClick={() => onReuse(item)}
          >
            <Icon name="refresh" size={14} />
          </button>
          {item.file_url && (
            <button
              type="button"
              className="icon-btn"
              title="下载"
              onClick={() => download(item.file_url!, `${item.id}.${guessExt(item.file_type)}`)}
            >
              <Icon name="download" size={14} />
            </button>
          )}
          <div className="div-vt" style={{ height: 16, margin: "0 4px" }} />
          {item.credits_cost != null && (
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              消耗{" "}
              <span className="num fw-6" style={{ color: "var(--text-2)" }}>
                {item.credits_cost}
              </span>{" "}
              积分
            </span>
          )}
        </div>
      </div>

      <div className={`feed-output-grid ${gridClass}`}>
        {outputs.map((o, i) => {
          const isVideo = item.type === "video" || (o.file_type ?? "").startsWith("video");
          return (
            <div
              key={i}
              className={`feed-output ${ratioToAspectClass(item.ratio)}`}
              style={{
                backgroundImage: isVideo ? undefined : `url(${o.file_url})`,
                background: isVideo ? "var(--text)" : undefined,
                display: isVideo ? "grid" : undefined,
                placeItems: isVideo ? "center" : undefined
              }}
              onClick={() =>
                isVideo
                  ? window.open(o.file_url, "_blank")
                  : onZoom({ url: o.file_url, alt: item.prompt })
              }
            >
              {isVideo && <Icon name="video" size={28} style={{ color: "#fff", opacity: 0.85 }} />}
              <div className="actions">
                <button
                  type="button"
                  title="下载"
                  onClick={(e) => {
                    e.stopPropagation();
                    download(o.file_url);
                  }}
                >
                  <Icon name="download" size={12} />
                </button>
                <button
                  type="button"
                  title="放大"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isVideo) onZoom({ url: o.file_url, alt: item.prompt });
                  }}
                >
                  <Icon name="eye" size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PendingCard({ pending }: { pending: PendingTask }) {
  const n = pending.outputCount;
  const gridClass = n === 1 ? "n1" : n === 2 ? "n2" : "n4";
  return (
    <div className="feed-item fade-in">
      <div className="flex-1">
        <div className="feed-meta-line">
          <span className="chip chip-soft-warn">
            <Icon name="bolt" size={11} />
            {pending.kind === "image" ? "生成中" : "排队中"}
          </span>
          <span className="chip">{pending.modelName}</span>
          <span className="chip">{pending.ratio}</span>
          {pending.kind === "image" && <span className="chip">{n} 张</span>}
        </div>
        <div className="feed-prompt">{pending.prompt}</div>
        <div className="feed-bottom-row">
          <span style={{ fontSize: 12, color: "var(--text-3)" }} className="animate-breathe">
            <Icon name="refresh" size={12} /> 等待结果…
          </span>
        </div>
      </div>
      <div className={`feed-output-grid ${gridClass}`}>
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            className={`feed-output animate-breathe ${ratioToAspectClass(pending.ratio)}`}
            style={{ background: "var(--bg-subtle)" }}
          />
        ))}
      </div>
    </div>
  );
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.round(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.round(diff / 3600) + " 小时前";
  return `${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function guessExt(fileType: string | null): string {
  if (!fileType) return "bin";
  if (fileType.includes("png")) return "png";
  if (fileType.includes("jpeg") || fileType.includes("jpg")) return "jpg";
  if (fileType.includes("webp")) return "webp";
  if (fileType.includes("mp4")) return "mp4";
  return "bin";
}
