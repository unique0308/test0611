-- =============================================================================
-- 013_v1_user_purpose.sql · V1.12 用户自定义使用目的
--
-- 设计依据:
--   - ../MVP跟踪文档/产品跟踪.md §3.2 V1.12
--   - Q-V1-10 答(2026-05-19):不审核直接生效,定期合并
--
-- 新字段:
--   - purpose_tags.is_user_created BOOLEAN — 员工新增标记
--   - purpose_tags.created_by_user_id UUID — 创建人(可空,seed 6 + 默认未分类 NULL)
--
-- 合并逻辑(走既有 merged_into_id):
--   - admin 把 source.merged_into_id = target.id 后,source 在 purpose_tags 列表里消失
--     (现有部分唯一索引 WHERE merged_into_id IS NULL 保护)
--   - 历史 generation_tasks.purpose_tag_name 快照保留(不批量改;V2 视情况批量重写)
-- =============================================================================

ALTER TABLE purpose_tags
    ADD COLUMN is_user_created BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN created_by_user_id UUID REFERENCES users(id);

-- 既有 7 个 seed tag(未分类 + 6 预设)都是 is_user_created=FALSE(DEFAULT),无需 UPDATE

CREATE INDEX idx_purpose_tags_user_created
    ON purpose_tags(is_user_created)
    WHERE is_user_created = TRUE;
