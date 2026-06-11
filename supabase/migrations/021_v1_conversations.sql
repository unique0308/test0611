-- V1 加 B 完整版会话化(2026-05-29,设计参考 §3.1 + §4.1.1 + 变更日志第二条)
-- conversations 表 + generation_tasks 加 conversation_id + 既有 task 迁移到 user 的"默认创作"
--
-- 8 决策依据:
--  #3 历史 task 迁移 = 全塞一个 per-user 的"默认创作"系统会话
--  #6 删除会话语义 = 软删(deleted_at 置值,task 不动)
--  #7 sessionStorage 决策(2026-05-21)废止 = feed 改 DB 按 conversation_id 拉
--  #8 空会话允许 = name 可为空(首次 task 生成后自动回填前 18 字)
--
-- 幂等:CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / 迁移 SQL 用 WHERE conversation_id IS NULL

-- ─── conversations 表 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT '',                   -- 空字符串 = 待首次 task 生成后回填前 18 字
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,             -- 系统"默认创作"会话(每 user 唯一,不可删/不可重命名)
    pinned_at       TIMESTAMPTZ,                                -- 非 NULL = 置顶,按此倒序排
    deleted_at      TIMESTAMPTZ,                                -- 软删时间(API 层过滤)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()          -- 最后一次 task 生成 / rename / pin 时刷新
);

-- 每 user 最多 1 个 is_default=TRUE 的 conversation(部分唯一索引)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_one_default_per_user
    ON conversations (user_id) WHERE is_default = TRUE;

-- 列表/排序常用索引
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
    ON conversations (user_id, updated_at DESC) WHERE deleted_at IS NULL;

-- ─── generation_tasks 加 conversation_id ────────────────────────────
ALTER TABLE generation_tasks
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generation_tasks_conversation
    ON generation_tasks (conversation_id, created_at DESC) WHERE conversation_id IS NOT NULL;

-- ─── 既有 task 迁移到 user 的"默认创作"────────────────────────────
-- 1) 为每个有 task 但还没有 default conversation 的 user 创建"默认创作"
-- 2) 把该 user 的所有 conversation_id IS NULL 的 task 关联到 default conversation
-- 3) 默认会话 updated_at = 该 user 最近一次 task 的 created_at(对齐排序)

INSERT INTO conversations (user_id, name, is_default, updated_at)
SELECT
    t.user_id,
    '默认创作',
    TRUE,
    MAX(t.created_at)
FROM generation_tasks t
WHERE t.conversation_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.user_id = t.user_id AND c.is_default = TRUE
  )
GROUP BY t.user_id
ON CONFLICT DO NOTHING;

UPDATE generation_tasks t
SET conversation_id = c.id
FROM conversations c
WHERE t.conversation_id IS NULL
  AND c.user_id = t.user_id
  AND c.is_default = TRUE;

-- 后续新 user 首次访问时,API 层 ensureDefaultConversation 兜底创建
-- (没历史 task 的 user 此 migration 不为其创建 default,避免空表行)
