import Link from "next/link";
import type { UsageDashboardData } from "@/lib/db/queries";

// 个人中心 — 用量核心区(2026-05-25 Day 44 重塑规格 §3.3-§3.5)
//
// 倒金字塔布局,自上而下回答三个问题:
//   1. 我这个月用了多少 / 还能用吗 → 额度(最显眼,普通员工通栏 / manager 2 列)
//   2. 我最近活跃吗 → 14 天双色柱状图
//   3. 我用在哪、用什么 → 用途 / 模型拆分
//
// 配额 ≥85% 转 warn 橙、≥100% 转 danger 红;**仅视觉提示,不阻断生成**(决策 5)。
// 超额文案改陈述句「已超出本月额度,仍可继续使用」,不用恐吓式。
// 纯展示,Server Component。

type Props = {
  data: UsageDashboardData;
};

// 业务色循环(swatch / meter,§3.14)
const SERIES_COLORS = ["#2B6CFE", "#8C5BFF", "#1F9D55", "#E0992F", "#A0A6B2"];

export function UsagePanel({ data }: Props) {
  const hasDept = data.dept_overview != null;
  const isEmpty = data.total_count === 0 && data.personal_credits_used === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── 额度区 ───────────────────────────────────────────────── */}
      {hasDept ? (
        // 部门负责人:2 列(个人额度 + 部门额度概览)
        <div className="grid grid-cols-2 gap-3.5">
          <PersonalQuotaCard data={data} variant="compact" />
          <DeptOverviewCard data={data.dept_overview!} />
        </div>
      ) : (
        // 普通员工 / admin:个人额度主卡通栏
        <PersonalQuotaCard data={data} variant="main" />
      )}

      {/* ── 产出卡(2 列)─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3.5">
        <ProductionCard
          kind="image"
          count={data.image_count}
          sharePct={data.image_share_pct}
          momPct={data.image_mom_pct}
        />
        <ProductionCard
          kind="video"
          count={data.video_count}
          sharePct={data.video_share_pct}
          momPct={data.video_mom_pct}
        />
      </div>

      {/* ── 近 14 天柱状图 ──────────────────────────────────────── */}
      <div className="border border-border rounded-[12px] bg-card px-5 py-[18px]">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-body font-semibold text-text">近 14 天每日生成次数</h4>
          <div className="flex gap-3.5 text-small font-normal text-text-2">
            <LegendDot color="#2B6CFE" label="图片" />
            <LegendDot color="#8C5BFF" label="视频" />
          </div>
        </div>
        {isEmpty ? (
          <div className="py-10 text-center text-sub text-text-3">本月还没有生成记录</div>
        ) : (
          <DailyBarChart daily={data.daily} max={data.daily_max} />
        )}
      </div>

      {/* ── Breakdown grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-3.5">
        <div className="border border-border rounded-[12px] bg-card overflow-hidden">
          <ListHead title="按使用目的拆分" sub="本月" />
          {data.purposes.length === 0 ? (
            <EmptyRow />
          ) : (
            data.purposes.map((p, i) => {
              const peak = data.purposes[0].count || 1;
              const color = SERIES_COLORS[i % SERIES_COLORS.length];
              return (
                <div
                  key={p.name}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-[18px] py-3 text-sub border-b border-border last:border-b-0"
                >
                  <div className="flex items-center gap-2 text-text min-w-0">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ background: color }}
                    />
                    <span className="truncate">{p.name}</span>
                  </div>
                  <div className="w-[140px] h-1.5 rounded bg-[#F1F3F7] overflow-hidden">
                    <span
                      className="block h-full rounded"
                      style={{ width: `${pct(p.count, peak)}%`, background: color }}
                    />
                  </div>
                  <div className="num font-medium text-text min-w-[56px] text-right">
                    {p.count.toLocaleString()} 次
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border border-border rounded-[12px] bg-card overflow-hidden">
          <ListHead title="常用模型 Top 4" sub="本月" />
          {data.models.length === 0 ? (
            <EmptyRow />
          ) : (
            data.models.map(m => (
              <div
                key={m.name}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-[18px] py-3 text-sub border-b border-border last:border-b-0"
              >
                <span className="truncate text-text">{m.name}</span>
                <div className="num font-medium text-text min-w-[56px] text-right">
                  {m.count.toLocaleString()} 次
                </div>
                <div className="num text-text-3 text-small min-w-[36px] text-right">
                  {pct(m.count, data.total_count)}%
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 额度卡 ─────────────────────────────────────────────────────────────────

// 进度条颜色语义(决策 5 修订):
//   < 85% violet / 85-100% warn / ≥100% danger;**仅视觉提示,不阻断生成**
type Bucket = "ok" | "warn" | "risk";

function quotaBucket(pct: number): Bucket {
  if (pct >= 100) return "risk";
  if (pct >= 85) return "warn";
  return "ok";
}

const BAR_GRADIENT: Record<Bucket, string> = {
  ok: "linear-gradient(90deg, #5B6BFF, #8C5BFF)",
  warn: "linear-gradient(90deg, #FFB874, #E0992F)",
  risk: "linear-gradient(90deg, #FF7A7A, #E5484D)"
};

function PersonalQuotaCard({
  data,
  variant
}: {
  data: UsageDashboardData;
  variant: "main" | "compact";
}) {
  const bucket = quotaBucket(data.personal_pct_used);
  const isMain = variant === "main";
  const title = isMain ? "本月个人额度" : "我的个人额度";
  const isOver = data.personal_credits_used > data.personal_credits_limit;

  return (
    <div
      className={
        "border border-border rounded-[12px] bg-card flex flex-col gap-2 " +
        (isMain ? "px-6 py-5" : "px-[18px] py-4")
      }
    >
      <div className="flex items-center gap-1.5 text-cap font-normal text-text-2">
        <SunIcon />
        {title}
      </div>
      <div
        className={
          "flex items-baseline gap-1.5 num font-semibold text-text tracking-[-0.01em] " +
          (isMain ? "text-[34px] leading-[40px]" : "text-[26px] leading-[32px]")
        }
      >
        {data.personal_credits_used.toLocaleString()}
        <span className="text-[13px] font-medium text-text-3">
          / {data.personal_credits_limit.toLocaleString()} 积分
        </span>
        <span className="ml-2 text-cap font-medium text-text-3 num">
          {data.personal_pct_used}%
        </span>
      </div>
      <div className="h-2 rounded bg-[#F1F3F7] overflow-hidden mt-0.5">
        <div
          className="h-full rounded"
          style={{
            width: `${Math.min(100, data.personal_pct_used)}%`,
            background: BAR_GRADIENT[bucket]
          }}
        />
      </div>
      <div className="text-chip font-normal text-text-3">
        {isOver ? (
          // 超额陈述句:不恐吓
          <>已超出本月额度,仍可继续使用 · {data.reset_label}重置</>
        ) : (
          <>
            剩余{" "}
            <span className="num font-medium text-text-2">
              {data.personal_credits_remaining.toLocaleString()}
            </span>{" "}
            · {data.reset_label}重置
          </>
        )}
      </div>
    </div>
  );
}

function DeptOverviewCard({ data }: { data: NonNullable<UsageDashboardData["dept_overview"]> }) {
  const bucket = quotaBucket(data.pct_used);
  const isOver = data.credits_used > data.credits_limit;

  return (
    <div className="border border-border rounded-[12px] bg-card px-[18px] py-4 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-cap font-normal text-text-2">
        <BuildingIcon />
        部门额度
      </div>
      <div className="flex items-baseline gap-1.5 num font-semibold text-text text-[26px] leading-[32px] tracking-[-0.01em]">
        {data.credits_used.toLocaleString()}
        <span className="text-[13px] font-medium text-text-3">
          / {data.credits_limit.toLocaleString()} 积分
        </span>
        <span className="ml-2 text-cap font-medium text-text-3 num">
          {data.pct_used}%
        </span>
      </div>
      <div className="h-2 rounded bg-[#F1F3F7] overflow-hidden mt-0.5">
        <div
          className="h-full rounded"
          style={{
            width: `${Math.min(100, data.pct_used)}%`,
            background: BAR_GRADIENT[bucket]
          }}
        />
      </div>
      <div className="text-chip font-normal text-text-3 flex items-center justify-between">
        <span>
          {isOver ? (
            <>已超出部门额度,仍可继续使用</>
          ) : (
            <>
              本部门{" "}
              <span className="num font-medium text-text-2">{data.member_count}</span> 人
            </>
          )}
        </span>
        <Link
          href="/manager/dashboard"
          className="inline-flex items-center gap-0.5 text-primary hover:text-primary-ink transition"
        >
          查看部门看板 <ArrowIcon />
        </Link>
      </div>
    </div>
  );
}

// ─── 产出卡 ─────────────────────────────────────────────────────────────────

function ProductionCard({
  kind,
  count,
  sharePct,
  momPct
}: {
  kind: "image" | "video";
  count: number;
  sharePct: number;
  momPct: number | null;
}) {
  const isImage = kind === "image";
  const label = isImage ? "图片生成" : "视频生成";
  const barColor = isImage
    ? "linear-gradient(90deg, #34C172, #1F9D55)"
    : "linear-gradient(90deg, #5B6BFF, #8C5BFF)";
  return (
    <div className="border border-border rounded-[12px] bg-card px-[18px] py-4 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-cap font-normal text-text-2">
        {isImage ? <ImageIcon /> : <VideoIcon />}
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 num font-semibold text-text text-[28px] leading-[34px] tracking-[-0.01em]">
        {count.toLocaleString()}
        <span className="text-[12px] font-medium text-text-3">次</span>
      </div>
      <div className="h-1.5 rounded bg-[#F1F3F7] overflow-hidden mt-0.5">
        <div className="h-full rounded" style={{ width: `${sharePct}%`, background: barColor }} />
      </div>
      <div className="text-chip font-normal text-text-3">
        <MomDelta pct={momPct} />
      </div>
    </div>
  );
}

function MomDelta({ pct: value }: { pct: number | null }) {
  if (value === null) return <span className="text-text-3">上月暂无数据</span>;
  if (value === 0) return <span className="text-text-3">环比上月持平</span>;
  const up = value > 0;
  return (
    <span
      className={
        "inline-flex items-center gap-1 " + (up ? "text-success" : "text-danger")
      }
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      环比上月 {up ? "+" : ""}
      {value}%
    </span>
  );
}

// ─── 通用 ───────────────────────────────────────────────────────────────────

function ListHead({ title, sub }: { title: string; sub: string }) {
  return (
    <h4 className="flex items-center justify-between px-[18px] py-3.5 text-body font-semibold text-text border-b border-border">
      {title}
      <span className="text-chip font-normal text-text-3">{sub}</span>
    </h4>
  );
}

function EmptyRow() {
  return (
    <div className="px-[18px] py-8 text-center text-sub text-text-3">本月暂无生成记录</div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

// 近 14 天双色柱状图(设计参考 §3.14,SVG viewBox 720×220,服务端直出)
function DailyBarChart({
  daily,
  max
}: {
  daily: UsageDashboardData["daily"];
  max: number;
}) {
  const W = 720;
  const H = 220;
  const P = { l: 40, r: 16, t: 14, b: 30 };
  const innerW = W - P.l - P.r;
  const innerH = H - P.t - P.b;
  const groupW = innerW / daily.length;
  const barW = Math.min(14, groupW * 0.36);
  const ticks = [0, 1, 2, 3, 4].map(i => (max / 4) * i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[220px] block">
      {ticks.map(v => {
        const y = P.t + innerH - (v / max) * innerH;
        return (
          <g key={v}>
            <line
              x1={P.l}
              x2={W - P.r}
              y1={y}
              y2={y}
              stroke="#ECEEF2"
              strokeDasharray={v === 0 ? "0" : "2 4"}
            />
            <text
              x={P.l - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              fill="#A0A6B2"
              fontFamily="Inter, system-ui"
            >
              {v}
            </text>
          </g>
        );
      })}
      {daily.map((d, i) => {
        const cx = P.l + groupW * i + groupW / 2;
        const ih = (d.image / max) * innerH;
        const vh = (d.video / max) * innerH;
        return (
          <g key={d.label + i}>
            <rect
              x={cx - barW - 1}
              y={P.t + innerH - ih}
              width={barW}
              height={ih}
              rx={3}
              fill="#2B6CFE"
              opacity={0.92}
            />
            <rect
              x={cx + 1}
              y={P.t + innerH - vh}
              width={barW}
              height={vh}
              rx={3}
              fill="#8C5BFF"
              opacity={0.92}
            />
            <text
              x={cx}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="#A0A6B2"
              fontFamily="Inter, system-ui"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── 工具函数 ───────────────────────────────────────────────────────────────

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

// ─── 图标 ───────────────────────────────────────────────────────────────────

function svgProps(size = 14) {
  return {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };
}

function SunIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg {...svgProps()}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg {...svgProps()}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9l5 3-5 3z" fill="currentColor" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
