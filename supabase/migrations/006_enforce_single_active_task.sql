-- =============================================================================
-- 006_enforce_single_active_task.sql
--
-- 背景:Day 6 实测发现:单用户并发限制在 application 层(countActiveTasks)有 race
--   condition — 两个请求 100ms 内进来,都看到 active=0,都通过。
--
-- 修复:在 DB 层加 partial unique index,只在 status ∈ {queued, running} 时强制
--   每个 user_id 只能有一行。第二个并发 INSERT 会触发 23505 unique_violation,
--   Route Handler catch 之后返回 429。
--
-- 部分唯一索引允许 cancelled / succeeded / failed 任意多条,只限制活跃态。
-- =============================================================================

CREATE UNIQUE INDEX uniq_user_active_task
    ON generation_tasks(user_id)
    WHERE status IN ('queued', 'running');
