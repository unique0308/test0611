import type { KpiData } from "@/components/ui/primitives";

export type ExecutiveTrendPoint = {
  d: string;
  cost_k: number;
  outputs: number;
  rate: number;
};

export type DepartmentValueRow = {
  department: string;
  category: "high_value" | "cost_risk" | "potential" | "inactive";
  cost_cny: number;
  effective_outputs: number;
  active_rate: number;
  effective_rate: number;
  signal: string;
};

export type ScenarioValueRow = {
  scenario: string;
  tasks: number;
  cost_cny: number;
  effective_rate: number;
  action: string;
};

export type ModelProcurementRow = {
  model: string;
  cost_cny: number;
  success_rate: number;
  avg_seconds: number;
  best_for: string;
  action: "续用" | "观察" | "限制" | "下架评估";
};

export type ManagementAction = {
  level: "high" | "medium" | "low";
  title: string;
  evidence: string;
  owner: string;
};

export type DashboardChangeRow = {
  type: "新增" | "修改" | "保留" | "未做";
  area: string;
  original: string;
  current: string;
  note: string;
};

export type ExecutiveDashboardData = {
  kpis: KpiData[];
  roiTrend: ExecutiveTrendPoint[];
  departmentMatrix: DepartmentValueRow[];
  scenarioBreakdown: ScenarioValueRow[];
  modelPurchasing: ModelProcurementRow[];
  managementActions: ManagementAction[];
  changeLog: DashboardChangeRow[];
  dataNotes: string[];
};

export const EXECUTIVE_DASHBOARD_FIXTURE: ExecutiveDashboardData = {
  kpis: [
    {
      key: "investment",
      label: "本月 AI 总投入",
      value: 96800,
      isPrefix: true,
      prefix: "¥",
      delta: 18.4,
      deltaDir: "up",
      foot: "平台调用 + 工具报销合计",
      icon: "receipt",
      accent: "violet"
    },
    {
      key: "effective_outputs",
      label: "本月有效产出",
      value: 386,
      unit: "件",
      delta: 31.2,
      deltaDir: "up",
      foot: "收藏 / 下载 / 二次生成 / 人工采纳",
      icon: "star",
      accent: "success"
    },
    {
      key: "active_org",
      label: "活跃部门 / 人数",
      value: 7,
      unit: "部门",
      foot: "47 人持续使用 · 2 个部门待推动",
      icon: "building",
      accent: "accent"
    },
    {
      key: "forecast_cost",
      label: "预计月末成本",
      value: 128000,
      isPrefix: true,
      prefix: "¥",
      delta: 12.6,
      deltaDir: "up",
      foot: "按当前消耗速度预测",
      icon: "trend",
      accent: "warn",
      attention: true
    }
  ],
  roiTrend: [
    { d: "1月", cost_k: 42, outputs: 118, rate: 18 },
    { d: "2月", cost_k: 51, outputs: 143, rate: 21 },
    { d: "3月", cost_k: 63, outputs: 196, rate: 25 },
    { d: "4月", cost_k: 78, outputs: 255, rate: 29 },
    { d: "5月", cost_k: 91, outputs: 312, rate: 33 },
    { d: "6月", cost_k: 96, outputs: 386, rate: 37 }
  ],
  departmentMatrix: [
    {
      department: "美术组",
      category: "high_value",
      cost_cny: 28600,
      effective_outputs: 142,
      active_rate: 82,
      effective_rate: 41,
      signal: "高投入高产出，适合继续扩灰"
    },
    {
      department: "市场运营",
      category: "high_value",
      cost_cny: 21400,
      effective_outputs: 96,
      active_rate: 76,
      effective_rate: 38,
      signal: "Banner 与短视频需求稳定"
    },
    {
      department: "产品设计",
      category: "potential",
      cost_cny: 9400,
      effective_outputs: 51,
      active_rate: 62,
      effective_rate: 35,
      signal: "低成本高潜力，可补模板"
    },
    {
      department: "发行支持",
      category: "cost_risk",
      cost_cny: 17800,
      effective_outputs: 28,
      active_rate: 54,
      effective_rate: 17,
      signal: "成本偏高，需复盘模型选择"
    },
    {
      department: "客服",
      category: "inactive",
      cost_cny: 2600,
      effective_outputs: 7,
      active_rate: 18,
      effective_rate: 12,
      signal: "低活跃，建议安排场景培训"
    }
  ],
  scenarioBreakdown: [
    {
      scenario: "换装 / 活动皮肤",
      tasks: 214,
      cost_cny: 18600,
      effective_rate: 46,
      action: "优先产品化为快捷模式"
    },
    {
      scenario: "Banner 元素",
      tasks: 176,
      cost_cny: 14300,
      effective_rate: 39,
      action: "补安全区与尺寸预设"
    },
    {
      scenario: "风格转换",
      tasks: 138,
      cost_cny: 16800,
      effective_rate: 31,
      action: "拆分风格参考与结构参考"
    },
    {
      scenario: "图生视频",
      tasks: 59,
      cost_cny: 22100,
      effective_rate: 24,
      action: "控制额度并单独验证模型"
    },
    {
      scenario: "UI 配图",
      tasks: 81,
      cost_cny: 6900,
      effective_rate: 28,
      action: "观察是否需要独立工作台"
    }
  ],
  modelPurchasing: [
    {
      model: "Gemini 2.5 Flash Image",
      cost_cny: 24800,
      success_rate: 94,
      avg_seconds: 18,
      best_for: "快速出图、换装初稿",
      action: "续用"
    },
    {
      model: "Seedream 4.5",
      cost_cny: 18600,
      success_rate: 89,
      avg_seconds: 24,
      best_for: "角色细节、风格转换",
      action: "观察"
    },
    {
      model: "Runway Gen-4",
      cost_cny: 31200,
      success_rate: 76,
      avg_seconds: 74,
      best_for: "图生视频、动态广告",
      action: "限制"
    },
    {
      model: "Legacy Mock Video",
      cost_cny: 4200,
      success_rate: 61,
      avg_seconds: 42,
      best_for: "流程占位",
      action: "下架评估"
    }
  ],
  managementActions: [
    {
      level: "high",
      title: "发行支持成本偏高但有效产出低",
      evidence: "本月 ¥17,800，产出 28 件，有效率 17%",
      owner: "运营负责人"
    },
    {
      level: "high",
      title: "视频模型成本上涨，需要单独配额",
      evidence: "Runway Gen-4 占本月模型成本 32%，有效率 24%",
      owner: "管理员"
    },
    {
      level: "medium",
      title: "美术组适合进入第二轮灰测",
      evidence: "有效产出 142 件，活跃率 82%，多参考图需求集中",
      owner: "产品负责人"
    },
    {
      level: "medium",
      title: "客服团队低活跃，需要场景培训",
      evidence: "活跃率 18%，主要停留在试用阶段",
      owner: "部门负责人"
    }
  ],
  changeLog: [
    {
      type: "新增",
      area: "一级页面入口",
      original: "原项目只有 /admin 数据看板、/admin/insights、/manager/dashboard。",
      current: "新增 /admin_new 老板驾驶舱，侧边栏管理组新增一级入口。",
      note: "用于和原数据看板直接切换，不放在 /admin 二级路径。"
    },
    {
      type: "新增",
      area: "老板 KPI",
      original: "原 /admin 首屏偏 admin 运维：调用积分、报销、活跃部门、待处理事项。",
      current: "新增 AI 总投入、有效产出、活跃部门/人数、预计月末成本。",
      note: "从“用了多少”转为“投入是否产出价值”。"
    },
    {
      type: "修改",
      area: "趋势分析",
      original: "原看板主要看调用积分、图/视频趋势和部门用量趋势。",
      current: "改为 ROI 趋势：成本、有效产出、有效产出率。",
      note: "当前使用演示数据，真实有效产出口径待接埋点。"
    },
    {
      type: "修改",
      area: "部门分析",
      original: "原看板按部门展示用量、配额、成员、目的和模型明细。",
      current: "改为部门价值矩阵：高投入高产出、高投入低产出、低投入高潜力、低活跃需推动。",
      note: "帮助老板判断扩灰、培训、控费和复盘对象。"
    },
    {
      type: "新增",
      area: "业务场景价值",
      original: "原看板没有按美术业务场景拆分价值。",
      current: "新增换装、Banner、风格转换、图生视频、UI 配图的任务、成本、有效率和建议动作。",
      note: "对应访谈中美术组最关心的业务路径。"
    },
    {
      type: "修改",
      area: "模型采购视图",
      original: "原看板已有模型 Top / 模型异动，主要看用量和环比变化。",
      current: "改为模型成本、成功率、平均耗时、适用场景和采购动作。",
      note: "从模型排名升级为续用、观察、限制、下架评估。"
    },
    {
      type: "新增",
      area: "风险与管理动作",
      original: "原 AI 洞察页提供告警/数据信号，但老板驾驶舱无独立动作卡。",
      current: "新增 4 条管理动作卡，包含证据和建议负责人。",
      note: "把数据提示转成可分派事项。"
    },
    {
      type: "保留",
      area: "原有看板",
      original: "/admin、/admin/insights、/manager/dashboard 是现有可用页面。",
      current: "全部保留，没有替换旧页面。",
      note: "老板驾驶舱是复制改造出的新版原型。"
    },
    {
      type: "未做",
      area: "真实数据接入",
      original: "原看板部分字段已接 Supabase，部分字段使用 fixture。",
      current: "/admin_new 暂时全部使用 fixture 演示数据。",
      note: "没有新增数据库、没有新增真实 API、没有迁移。"
    }
  ],
  dataNotes: [
    "当前页面为老板驾驶舱原型，所有数值均为演示数据。",
    "有效产出暂按收藏、下载、二次生成、人工采纳的未来口径展示。",
    "业务场景、项目归档率、参考图复用率目前待接真实字段。",
    "模型成本与成功率用于展示采购决策方式，后续需接 EasyRouter 真实价格和任务状态。"
  ]
};
