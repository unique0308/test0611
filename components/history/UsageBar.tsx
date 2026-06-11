import type { PersonalUsage } from "@/lib/db/queries";

// 个人用量条(设计参考 4.2 顶部一行)
// 文案:本月已用 {credits} 积分 (部门额度 {limit},剩 {remaining}) ≈ {images} 张图 / {videos} 段视频

export function UsageBar({ usage }: { usage: PersonalUsage }) {
  const { used_credits_month, limit_credits, remaining_credits, images_baseline_per_unit, videos_baseline_per_unit, warning } =
    usage;

  const remainingImages = images_baseline_per_unit > 0
    ? Math.floor(remaining_credits / images_baseline_per_unit)
    : 0;
  const remainingVideos = videos_baseline_per_unit > 0
    ? Math.floor(remaining_credits / videos_baseline_per_unit)
    : 0;

  const numClass =
    warning === "red"
      ? "text-danger font-medium"
      : warning === "yellow"
      ? "text-warn font-medium"
      : "text-text";

  return (
    <div className="mx-auto max-w-content px-8 pt-6 pb-2">
      <p className="text-body text-text-2">
        本月已用 <span className={`num ${numClass}`}>{used_credits_month.toLocaleString()}</span> 积分
        <span className="text-text-3"> (部门额度 <span className="num">{limit_credits.toLocaleString()}</span>,剩 <span className="num">{remaining_credits.toLocaleString()}</span>) </span>
        ≈ 还可生成 <span className="num text-text">{remainingImages}</span> 张图 / <span className="num text-text">{remainingVideos}</span> 段视频
      </p>
    </div>
  );
}
