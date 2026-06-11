-- =====================================================================
-- 024 · M5 P1 波 2 · conversations 加主标签字段(D16 DM5.9 + DM17.7 落地)
-- =====================================================================
-- D16 DM5.9 + DM17.7:
--   "主标签 = 会话属性" — 一个 conversation 对应一个业务场景(M5 5 预设之一)
--   会话头部常驻 chip 显示;员工选了后才能 submit(波 2 #4 blocking)
--   Dock 默认值 = 主标签;员工单次切换 Dock 标签 = 单次覆盖(不改主标签)
--
-- 字段语义:
--   primary_purpose_tag_id NULL    = 新会话,员工尚未选主标签 → 不能 submit
--   primary_purpose_tag_id 非 NULL = 已选 → Dock 默认 = 此 tag
--
-- FK 策略:
--   REFERENCES purpose_tags(id) ON DELETE SET NULL
--   (旧 tag 删除时 conv 主标签置空;实际不会发生因为 023 用 merged_into_id
--    不删旧 tag,但 SET NULL 是 fail-safe)
--
-- 历史 conversation 迁移:
--   既有 conv 全部留 NULL — 员工下次访问该 conv 时看到"📌 选择主标签 ↓",
--   选完后才能继续生成。**注意**:这意味着波 2 上线后,既有 user 的所有
--   conv(包括默认创作)首次进入都要选主标签 — 这是预期行为(D16 必选)
-- =====================================================================

BEGIN;

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS primary_purpose_tag_id UUID
    REFERENCES purpose_tags(id) ON DELETE SET NULL;

-- 列表/查询不常按主标签筛选,暂不加索引(灰测后 admin 聚合需要再加)
-- COMMENT 用于 schema 自描述,方便后续 admin tool 反查
COMMENT ON COLUMN conversations.primary_purpose_tag_id IS
    'D16 DM5.9 + DM17.7:会话主标签(M5 5 预设之一)。NULL=未选,需 blocking 不能 submit。改主标签不影响历史 task purpose_tag_name 快照(决策 3.2)';

COMMIT;
