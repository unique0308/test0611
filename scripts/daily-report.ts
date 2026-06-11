/**
 * 飞书每日数据推送(任务 3.6)
 * 用法:
 *   npm run report           # 当前 mock 模式 console.log
 *   npm run report -- 2026-05-17  # 指定日期
 *
 * 真实接入(NOTIFICATION_MODE=feishu)切换:
 *   - 见 ../MVP跟踪文档/后期补全清单.md 第 9 节
 *   - 实现 lib/notifications/feishu-bot.ts(用 webhook + 加签密钥)
 *   - 部署时挂 cron:`0 9 * * * cd /var/www/ai-platform && npm run report >> /var/log/ai-platform/daily.log 2>&1`
 */

import { getDailyReportData } from "@/lib/db/queries";
import { sendDailyReport } from "@/lib/notifications";

async function main() {
  const arg = process.argv[2];
  // 默认昨天(早 9 点的 cron 推送的应该是昨日数据)
  const date = arg ? new Date(arg) : new Date(Date.now() - 86400_000);
  if (Number.isNaN(date.getTime())) {
    console.error("invalid date:", arg);
    process.exit(1);
  }

  const data = await getDailyReportData(date);
  await sendDailyReport(data);
}

main().catch(e => {
  console.error("daily-report failed:", e);
  process.exit(1);
});
