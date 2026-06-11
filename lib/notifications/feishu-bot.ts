import type { DailyReport } from "./mock";

// NOTIFICATION_MODE=feishu 时的实现骨架
// MVP 阶段函数体 throw,切换流程见 ../MVP跟踪文档/后期补全清单.md 第 9 节

const TODO = "TODO: integrate feishu bot webhook (见 LOCAL_SECRETS.md 第 5 节)";

export async function sendDailyReport(_data: DailyReport): Promise<void> {
  throw new Error(TODO);
}

export async function sendAlert(_message: string): Promise<void> {
  throw new Error(TODO);
}
