// Admin fixtures — 后端未提供的字段，UI 用占位展示
// 来源：原型设计V2/_extract/src/data.jsx
// TODO（后端缺口）：
//   1. trend14 按 type 拆分（img/vid 双线）——后端 MultiTrend 是按部门拆色，没按 type
//   2. spend stat-quad：单据总数 / 平均 / 报销人数 / 人均
//   3. 工具 Top（按报销金额排序的工具清单）——后端有 SpendBreakdown 但没按工具维度
//   4. 部门支出 + 近 6 月趋势 ——后端有 SpendBreakdown 但没按部门 / 月度拆
//   5. 总览的"截至时间 · 实时"标签 —— 用前端时钟生成即可

export interface SpendQuadFixture {
  invoiceCount: { value: number; foot: string };
  avgInvoice: { value: number; foot: string };
  reimbursers: { value: number; foot: string };
  perCapita: { value: number; foot: string };
}

export const SPEND_QUAD_FIXTURE: SpendQuadFixture = {
  invoiceCount: { value: 32, foot: "本月提交 · 1 待审" },
  avgInvoice: { value: 583, foot: "单笔均值" },
  reimbursers: { value: 28, foot: "占活跃员工 60%" },
  perCapita: { value: 666, foot: "按报销人计算" }
};

export interface ToolTopFixture {
  name: string;
  kind: string;
  amount: number;
  users: number;
  share: number;
}

export const TOOL_TOP_FIXTURE: ToolTopFixture[] = [
  { name: "Midjourney Pro", kind: "设计工具", amount: 4800, users: 8, share: 25.7 },
  { name: "Cursor Business", kind: "代码工具", amount: 3840, users: 4, share: 20.6 },
  { name: "Runway Standard", kind: "视频工具", amount: 2880, users: 3, share: 15.4 },
  { name: "Tripo Pro", kind: "设计工具", amount: 2160, users: 2, share: 11.6 },
  { name: "Claude Pro", kind: "AI 助手", amount: 1728, users: 6, share: 9.3 },
  { name: "ChatGPT Plus", kind: "AI 助手", amount: 1440, users: 5, share: 7.7 },
  { name: "Adobe Firefly", kind: "设计工具", amount: 1200, users: 4, share: 6.4 },
  { name: "其他", kind: "—", amount: 595, users: 2, share: 3.2 }
];

export interface DeptSpendFixture {
  dept: string;
  spend: number;
  share: number;
  count: number;
}

export const DEPT_SPEND_FIXTURE: DeptSpendFixture[] = [
  { dept: "设计组", spend: 6840, share: 36.7, count: 9 },
  { dept: "内容组", spend: 4200, share: 22.5, count: 5 },
  { dept: "产品创新组", spend: 3580, share: 19.2, count: 12 },
  { dept: "研发组", spend: 2400, share: 12.9, count: 11 },
  { dept: "运营组", spend: 1023, share: 5.5, count: 7 },
  { dept: "人事组", spend: 600, share: 3.2, count: 3 }
];

export interface MonthBarFixture {
  d: string;
  v: number;
}

export const MONTH_BARS_FIXTURE: MonthBarFixture[] = [
  { d: "6月", v: 14200 },
  { d: "7月", v: 15800 },
  { d: "8月", v: 16400 },
  { d: "9月", v: 17200 },
  { d: "10月", v: 17900 },
  { d: "11月", v: 18643 }
];

export interface SpendStackTypeFixture {
  label: string;
  pct: number;
  color: string;
}

export const SPEND_STACK_TYPES_FIXTURE: SpendStackTypeFixture[] = [
  { label: "设计工具", pct: 38, color: "#FF9D7C" },
  { label: "AI 助手", pct: 28, color: "#FFC97B" },
  { label: "代码工具", pct: 22, color: "#A8E6B0" },
  { label: "视频工具", pct: 12, color: "#C4B5FD" }
];

const PURPOSE_COLORS = ["#6366F1", "#8B5CF6", "#16A34A", "#F59E0B", "#EC4899", "#94979F"];
export function purposeColor(i: number): string {
  return PURPOSE_COLORS[i % PURPOSE_COLORS.length];
}
