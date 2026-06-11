-- 018: AI 洞察页 · 用户对洞察的操作记录（2026-05-26）
-- 背景：DASHBOARD_NOTES §4 拍板的 /admin/insights 页面。
--       不持久化洞察主体（每次实时跑规则计算），只持久化用户的操作
--       —— 这样规则改了无需回填数据，"忽略"在月内有效、下月同问题会再次出现。
-- 用法：每条洞察有一个稳定 insight_key（形如 "quota_forecast:dept_id:2026-05"），
--       用户点"忽略"或"已处理"时往这张表插一行。
--       computeInsights() 时 LEFT JOIN 排除已忽略 / 已处理。

CREATE TABLE IF NOT EXISTS insight_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 形如 "rule_type:target_id:period"，由 lib/admin/insights 各 rule 自己生成
    insight_key TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('ignored', 'actioned')),
    actor_id UUID NOT NULL REFERENCES users(id),
    acted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- "actioned" 时可选附说明（如"已与产研部沟通调高配额至 8000"）
    note TEXT
);

-- 查询主索引：computeInsights 时按 key 一把捞所有 actions
CREATE INDEX IF NOT EXISTS idx_insight_actions_key
    ON insight_actions(insight_key);

-- 操作审计索引：管理员复盘"我处理了哪些洞察"
CREATE INDEX IF NOT EXISTS idx_insight_actions_actor
    ON insight_actions(actor_id, acted_at DESC);
