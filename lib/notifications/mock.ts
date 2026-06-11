// NOTIFICATION_MODE=mock 时的实现:console.log 输出,不实际发送
// 切换流程见 ../MVP跟踪文档/后期补全清单.md 第 9 节

export type DailyReport = {
  date: string;
  total_generations: number;
  succeeded?: number;
  failed?: number;
  error_rate: number;
  total_credits?: number;
  total_cny?: number;
  top_departments: Array<{ name: string; count: number }>;
  top_models: Array<{ name: string; count: number }>;
};

// 格式化为飞书机器人会发送的 markdown(切真实时同一份字符串发 webhook)
export function formatDailyReportMarkdown(d: DailyReport): string {
  const errPct = (d.error_rate * 100).toFixed(1);
  const lines = [
    `**AI 中台 · ${d.date} 日报**`,
    "",
    `📊 **总生成**:${d.total_generations} 次 (succeeded ${d.succeeded ?? "-"} / failed ${d.failed ?? "-"})`,
    `⚠️ **错误率**:${errPct}%`,
    `💰 **消耗**:${d.total_credits ?? "-"} 积分 ≈ ¥${(d.total_cny ?? 0).toFixed(2)}`,
    ""
  ];
  if (d.top_departments.length) {
    lines.push("**Top 部门**:");
    d.top_departments.forEach((r, i) => lines.push(`  ${i + 1}. ${r.name} — ${r.count} 次`));
    lines.push("");
  }
  if (d.top_models.length) {
    lines.push("**Top 模型**:");
    d.top_models.forEach((r, i) => lines.push(`  ${i + 1}. ${r.name} — ${r.count} 次`));
  }
  return lines.join("\n");
}

export async function sendDailyReport(data: DailyReport): Promise<void> {
  const md = formatDailyReportMarkdown(data);
  // eslint-disable-next-line no-console
  console.log("\n========== [notifications:mock] daily report ==========");
  // eslint-disable-next-line no-console
  console.log(md);
  // eslint-disable-next-line no-console
  console.log("======================================================\n");
  // 切真实时:把 md 包成 {msg_type: "text", content: {text: md}} POST 到 webhook
}

export async function sendAlert(message: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[notifications:mock] 🚨 ALERT: ${message}`);
}
