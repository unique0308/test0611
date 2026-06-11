-- =====================================================================
-- 023 · M5 落地 P1·任务 1:purpose_tags 收敛到 5 新预设
-- =====================================================================
-- D16 DM5.1(2026-05-29 修订):
--   V1 预设 = 5 个标签(营销推广 / 产品展示 / 设计参考 / 汇报演示 / 其他)
--   前 4 = 业务场景维度(图/视频共用)/ 第 5 = 兜底(选中弹 optional <20 字进 audit_log)
--
-- 旧 seed(002):7 预设(未分类/营销物料/产品设计/短视频内容/内部素材/客户演示/其他)
-- 当前 DB 还有 1 个 user-created "产品发布" merged_into "营销物料"
--
-- 策略 A(2026-06-01):
--   1. INSERT 5 新 tag(name_normalized 加 _v2 后缀避开旧 active uniq index)
--   2. 旧 6 业务预设 + 未分类 + 旧"其他" → merged_into_id 指向新 tag
--   3. user-created "产品发布"原指 旧"营销物料"→ 链穿到 新"营销推广"
--   4. listActivePurposeTags 走 WHERE merged_into_id IS NULL 自动只返 5 新 tag
--
-- 决策 3.2 快照保证:历史 generation_tasks.purpose_tag_name 不变
-- (admin 聚合按快照名 "未分类"/"营销物料" 等仍正确显示历史数据)
--
-- mapping 表:
--   未分类(default,real=43) → 其他(新兜底)
--   营销物料(real=13)       → 营销推广(语义连续)
--   产品设计(real=0)        → 产品展示(语义近)
--   短视频内容(real=0)      → 其他(0 用度,新池无直接对应)
--   内部素材(real=0)        → 其他
--   客户演示(real=0)        → 其他
--   其他(旧,real=0)         → 其他(新,同名)
--   产品发布(user,real=0)   → 营销推广(链穿,跟原 merge target 走)
-- =====================================================================

BEGIN;

-- 1. INSERT 5 新预设 tag
--    sort_order 1-5 / name_normalized 加 _v2 后缀避开旧 active uniq index 冲突
--    is_default=FALSE(M5 D16 决策:必选,无默认值)
INSERT INTO purpose_tags (name, name_normalized, is_default, sort_order, is_user_created)
VALUES
  ('营销推广', 'marketing_v2',     FALSE, 1, FALSE),
  ('产品展示', 'product_showcase', FALSE, 2, FALSE),
  ('设计参考', 'design_reference', FALSE, 3, FALSE),
  ('汇报演示', 'presentation',     FALSE, 4, FALSE),
  ('其他',     'other_v2',         FALSE, 5, FALSE)
ON CONFLICT (name_normalized) WHERE merged_into_id IS NULL DO NOTHING;

-- 2. 旧 7 seed tag 设 merged_into_id 指向新 tag
--    用临时 CTE 拿 5 新 tag id,然后 UPDATE 旧 tag
WITH new_tags AS (
  SELECT name_normalized, id
  FROM purpose_tags
  WHERE name_normalized IN ('marketing_v2', 'product_showcase', 'design_reference', 'presentation', 'other_v2')
    AND merged_into_id IS NULL
)
UPDATE purpose_tags AS old SET merged_into_id = nt.id
FROM new_tags AS nt
WHERE old.merged_into_id IS NULL
  AND old.is_user_created = FALSE
  AND old.name_normalized IN ('unclassified', 'marketing', 'product_design', 'short_video', 'internal', 'customer_demo', 'other')
  AND nt.name_normalized = CASE old.name_normalized
    WHEN 'unclassified'   THEN 'other_v2'
    WHEN 'marketing'      THEN 'marketing_v2'
    WHEN 'product_design' THEN 'product_showcase'
    WHEN 'short_video'    THEN 'other_v2'
    WHEN 'internal'       THEN 'other_v2'
    WHEN 'customer_demo'  THEN 'other_v2'
    WHEN 'other'          THEN 'other_v2'
  END;

-- 3. user-created tag 链穿:原指向已 merge 的旧 tag → 跟着新 tag
--    当前实际数据:"产品发布" merged_into "营销物料",链穿后 → "营销推广"
WITH chain AS (
  SELECT u.id AS user_tag_id, new_tag.id AS new_target_id
  FROM purpose_tags u
  JOIN purpose_tags old_target ON u.merged_into_id = old_target.id
  JOIN purpose_tags new_tag    ON old_target.merged_into_id = new_tag.id
  WHERE u.is_user_created = TRUE
    AND old_target.merged_into_id IS NOT NULL  -- 旧 target 现在已 merge
    AND new_tag.merged_into_id IS NULL          -- 新 target 是 active
)
UPDATE purpose_tags AS u SET merged_into_id = c.new_target_id
FROM chain AS c
WHERE u.id = c.user_tag_id;

COMMIT;
