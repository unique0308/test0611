// AI 洞察 · 共享类型
// 设计原则（DASHBOARD_NOTES §4 § 设计原则 #7）：
//   - 洞察不持久化主体，每次实时跑规则生成
//   - 用户的操作（忽略 / 已处理）才持久化在 insight_actions 表
//   - 每条洞察必须有一个稳定的 insight_key，让用户操作能跨次访问对齐

export type InsightCategory = "quota" | "model" | "spend" | "user";

export type InsightSeverity = "urgent" | "normal";

/** 洞察类型：
 *  - alert：基于硬指标的告警（配额上限、产品配置问题）—— admin 应该处理
 *  - signal：基于"环比/比例"的数据观察信号 —— 仅供 admin 参考观察，无 baseline 时阈值都是估值
 *  设计理由：产品早期没有 3 个月以上数据时，"乱花/突增"类规则阈值都是估的，
 *  应该把这类降级为"参考信号"而不是渲染成红色告警 */
export type InsightKind = "alert" | "signal";

/** 用户对洞察的操作状态（来自 insight_actions LEFT JOIN） */
export type InsightStatus = "active" | "ignored" | "actioned";

/** 跳回看板的证据链接 */
export type InsightEvidenceLink = {
  label: string;
  /** 站内路径（含 query string） */
  href: string;
};

/** 一条洞察的完整呈现结构 */
export type Insight = {
  /** 稳定标识，规则自行保证；形如 "quota_forecast:dept_id:2026-05" */
  key: string;
  category: InsightCategory;
  severity: InsightSeverity;
  /** alert（应处理）/ signal（参考观察）；默认 alert 但每个规则应显式设置 */
  kind: InsightKind;
  /** 一句话主张（H3 大小） */
  title: string;
  /** 1-2 句展开说明 */
  body: string;
  /** 关键证据数字（用 chip 排成一行） */
  metrics: Array<{ label: string; value: string }>;
  /** 跳回看板查看完整数据的链接 */
  evidence: InsightEvidenceLink[];
  /** 推荐动作的一句话（不强制要做，admin 自己判断） */
  suggestion?: string;
  /** 状态：active / ignored / actioned */
  status: InsightStatus;
  /** 归属部门 id（null = 跨部门信号，如 model-mom） */
  dept_id?: string | null;
  /** 归属部门名（null = 跨部门信号） */
  dept_name?: string | null;
  /** 涉及的模型名（仅 category=model 时有） */
  model_name?: string;
  /** 涉及的配额上下文（仅 quota-forecast / quota-fit），供 inline 调整用 */
  quota_context?: {
    department_id: string;
    credits_used: number;
    credits_limit: number;
    suggested_limit?: number;
  };
};

/** 按分类聚合的洞察分组（UI 渲染用） */
export type InsightGroup = {
  category: InsightCategory;
  label: string;
  insights: Insight[];
};

export const CATEGORY_LABEL: Record<InsightCategory, string> = {
  quota: "配额策略",
  model: "模型策略",
  spend: "支出策略",
  user: "用户异常"
};
