-- 017: V1 个人月配额(2026-05-25 Day 44)
-- 背景:决策 5 修订(产品跟踪 §4 决策 5 / §9 Day 44 条目)——
--       配额维度从「仅部门级」扩为「个人 + 部门 并存,两者都软提示不阻断」。
-- 落地:users 新增 monthly_quota_credits;默认 5000(与部门默认一致,避免 NULL 分支)。
--       「本月已用」按 user_id 聚合 generation_tasks.credits_cost,不需新表。
--       「按人调整」UI 留 V1.x 续:部门负责人后续可通过 manager 后台或 admin 后台改这个值。

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS monthly_quota_credits INTEGER NOT NULL DEFAULT 5000;

-- 防御:历史行也要 5000 兜底(IF NOT EXISTS 时新加列已 DEFAULT 5000,但若先前为不同默认值,
-- 这里强制对齐)
UPDATE users
    SET monthly_quota_credits = 5000
    WHERE monthly_quota_credits IS NULL OR monthly_quota_credits = 0;
