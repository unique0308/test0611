-- =============================================================================
-- 020_add_gemini3_pro_image.sql
--
-- 背景：2026-05-27 嘉斌追加 Google Gemini 3 Pro 图片预览模型
--   - easyrouter model_key = 'gemini-3-pro-image-preview'（8.5 折）
--   - 协议：Google 多模态 LLM，走 /v1/chat/completions（与 Gemini 2.5 Flash Image 同款）
--     → easyrouter provider 的 isOpenAIImageGenModel() 不命中，自动走 chat completions 分支
--
-- 单价（credits_per_unit）：
--   - Gemini 2.5 Flash Image 是 28-30 积分
--   - 3 Pro 是更高规格的预览版，且 8.5 折后，估 35 积分留余地
-- =============================================================================

INSERT INTO models
    (name, provider, type, easyrouter_model_key, is_baseline, credits_per_unit, enabled, priority, sort_order, description) VALUES
    ('Gemini 3 Pro Image (easyrouter)', 'easyrouter', 'image',
        'gemini-3-pro-image-preview',
        FALSE, 35, TRUE, 1, 5,
        'Google Gemini 3 Pro 图片生成（预览版），通过 easyrouter.io 调用（8.5 折通道）');
