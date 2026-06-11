-- =============================================================================
-- 015_easyrouter_as_baseline.sql
--
-- 背景:Day 38 末(2026-05-19)嘉斌决定测试期默认走 easyrouter.io 额度
--   - 014 接入了 easyrouter 但 baseline=FALSE,默认仍走 OpenRouter
--   - 嘉斌要求"100% 烧 easyrouter,OpenRouter 不显示"
--   - 测试期完成后买企业服务时,会写反向 migration 切回(或者直接换 EASYROUTER_API_KEY)
--
-- 改动:
--   1. OpenRouter 2 行 enabled=FALSE(抽屉不显示)+ baseline 仍 TRUE 但不可见
--   2. easyrouter 2 行 is_baseline=TRUE + sort_order=1(变成默认选中 + 顶部显示)
--
-- 副作用:
--   - 前端 ModelPickerDrawer 只显示 2 enabled 模型(easyrouter image+video)+ 2 mock
--   - GenerateCore.find(is_baseline=TRUE && enabled=TRUE) → 拿到 easyrouter 行
--   - 之前生成的历史任务里 model_name 快照仍是 "Gemini 2.5 Flash Image" / "Seedance 2.0 Fast"
--     (不带 easyrouter 后缀),不影响展示
-- =============================================================================

-- OpenRouter 下线
UPDATE models
SET enabled = FALSE
WHERE provider = 'openrouter';

-- easyrouter 顶上
UPDATE models
SET is_baseline = TRUE, sort_order = 1
WHERE provider = 'easyrouter';
