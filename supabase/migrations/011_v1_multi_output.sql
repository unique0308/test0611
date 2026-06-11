-- =============================================================================
-- 011_v1_multi_output.sql · V1.10 多张出图支持
--
-- 设计依据:
--   - ../MVP跟踪文档/产品跟踪.md §3.2 V1.10(图片出图数量 1/2/4)
--   - Q-V1-09 答:默认 1 张,可选 1/2/4
--   - Q-V1-13 答:取消 = 整 task 一起取消(天然支持,task.status='cancelled' 即可)
--
-- 设计决策(简化版,不引入 task_outputs 新表):
--   - generation_results schema 早就允许 1:N(只 task_id FK,无 unique 约束)
--   - 仅加 output_index INTEGER 字段 标识 0..3(主图 = 0);既有数据回填 0
--   - 新增复合索引 (task_id, output_index)
--   - 历史 / 收藏 / 批量下载等老代码只看 output_index=0(主图),向后兼容
--   - 新代码(GET 任务详情 / N 张展示)走 listTaskOutputs 拿全部
--
-- 跟原 V1 计划 task_outputs 新表 + generation_results → view 的差异:
--   原方案 Week 7 拆新表 + view;本方案 V1 阶段简化,既不破坏老代码,
--   也不引入 view 维护负担;V2 数据量大需要查询优化时再考虑迁
-- =============================================================================

ALTER TABLE generation_results
    ADD COLUMN output_index INTEGER NOT NULL DEFAULT 0;

-- 既有数据全部 output_index=0(单图,主图),DEFAULT 已经自动填,无需 UPDATE

-- 加复合索引让 "WHERE task_id=X ORDER BY output_index" 直接走索引
CREATE INDEX idx_results_task_output ON generation_results(task_id, output_index);

-- 注:不加 UNIQUE(task_id, output_index) 约束;V1 阶段并发写多 output 行的可能性低,
-- 应用层 createResults 函数显式传 output_index 0..N-1 即可;若 V2 升级到异步队列
-- 写 task_outputs,再加唯一约束
