-- 016: V1 收藏粒度细化到单张产物(2026-05-22 Day 41)
-- 背景:prompt_collections 原唯一约束 (user_id, task_id) —— 同一任务多张图共用一条收藏,
--       收藏一张 = 收藏整批。改为按 (user_id, task_id, output_index) 唯一,实现单张收藏。
-- 旧行回填 output_index=0(多数旧任务单图;多图旧收藏视为收藏首图,可接受)。

ALTER TABLE prompt_collections
    ADD COLUMN IF NOT EXISTS output_index INTEGER NOT NULL DEFAULT 0;

-- 旧唯一索引(按任务)换成按「任务 + 产物下标」
DROP INDEX IF EXISTS uniq_prompt_user_task;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_prompt_user_task_output
    ON prompt_collections(user_id, task_id, output_index)
    WHERE task_id IS NOT NULL;
