-- V1 加 B 后续清理(2026-05-29):INSIGHTS_DEMO_SEED 是 admin 洞察的演示假数据
-- (`scripts/seed-insights-demo.ts` 生成),不应出现在 user 的"默认创作"feed 中。
-- 021 migration 把所有 task 都迁到了 user 的 default conv,包括这批 demo seed。
-- 本 migration 把 demo seed 的 conversation_id 设回 NULL —— task 行保留(admin insights 仍用),只是不再属于 user 对话历史。
--
-- 幂等:WHERE conversation_id IS NOT NULL,再跑无 row 受影响

UPDATE generation_tasks
SET conversation_id = NULL
WHERE prompt LIKE '[INSIGHTS_DEMO_SEED]%' AND conversation_id IS NOT NULL;
