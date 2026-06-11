// 业务代码 import 的唯一入口
// NOTIFICATION_MODE 切换由本文件决定

import * as mock from "./mock";
import * as feishu from "./feishu-bot";

const useFeishu = process.env.NOTIFICATION_MODE === "feishu";
const impl = useFeishu ? feishu : mock;

export const sendDailyReport = impl.sendDailyReport;
export const sendAlert = impl.sendAlert;
export type { DailyReport } from "./mock";
