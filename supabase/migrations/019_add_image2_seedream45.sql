-- =============================================================================
-- 019_add_image2_seedream45.sql
--
-- 背景：2026-05-27 嘉斌要求 easyrouter 新增 2 个模型
--   - GPT Image 2（OpenAI，model_key = 'gpt-image-2'，8.5 折）— 图片
--   - PixVerse v6（PixVerse，model_key = 'PixVerse/v6'，8.5 折）— 视频
--
-- 注：原计划的 Seedream 4.5 在 easyrouter 上暂无，已撤掉。
--
-- 单价（credits_per_unit）说明：
--   - gpt-image-2：OpenAI 输入 $6.8/1M、输出 $25.5/1M（按 token 计费）
--     单张图按经验估 40 积分（高于 Gemini 2.5 Flash Image 28，因 OpenAI 更贵）
--   - PixVerse v6：按"分辨率 + 时长"计费（截图官方说明）
--     默认按 5s 视频估算 120 积分，与 Dreamina Seedance 2.0 Fast 同档
-- =============================================================================

INSERT INTO models
    (name, provider, type, easyrouter_model_key, is_baseline, credits_per_unit, enabled, priority, sort_order, description) VALUES
    ('GPT Image 2 (easyrouter)', 'easyrouter', 'image',
        'gpt-image-2',
        FALSE, 40, TRUE, 1, 3,
        'OpenAI gpt-image-2 图片生成，通过 easyrouter.io 调用（8.5 折通道）'),
    ('PixVerse v6 (easyrouter)', 'easyrouter', 'video',
        'PixVerse/v6',
        FALSE, 120, TRUE, 1, 3,
        'PixVerse v6 视频生成，按分辨率 + 时长计费，通过 easyrouter.io 调用（8.5 折通道）');
