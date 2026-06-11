-- =============================================================================
-- 004_provider_based_models.sql
--
-- 背景:Day 3.5(2026-05-18)provider-based 重构:
--   - lib/easyrouter/providers/{openrouter,volcengine,aihubmix}.ts 多 provider
--   - models 表的 `provider` 字段从只是 metadata 变成路由 key
--   - 后续接入企业自购的服务,只需要加 provider 文件 + 加 models 行
--
-- 本 migration:
--   - 清空 003 灌入的 2 个 mock 占位
--   - 加 4 个真实 model:
--     1. google/gemini-2.5-flash-image (openrouter, image, baseline,enabled)
--        — Day 3 实测 34s 稳定,cost 直接返回 USD
--     2. seedance-2-0-fast (volcengine, video, baseline, ENABLED=false 等 key)
--     3. mock-image-1024 (mock, fallback)
--     4. mock-video-1024 (mock, fallback)
--   - mock 模型保留作为 EASYROUTER_MODE=mock 或某 model 显式 provider=mock 时的兜底
-- =============================================================================

DELETE FROM models;

INSERT INTO models
    (name, provider, type, easyrouter_model_key, is_baseline, credits_per_unit, enabled, priority, sort_order) VALUES
    -- 真实 provider:OpenRouter Gemini Flash Image(图片 baseline,可用)
    -- Day 3 实测:34s 稳定 / cost 0.0387 USD ≈ ¥0.28 ≈ 28 积分
    ('Gemini 2.5 Flash Image', 'openrouter', 'image', 'google/gemini-2.5-flash-image',
        TRUE,  28,  TRUE,  0, 1),

    -- 真实 provider:火山方舟 Seedance(视频 baseline,key 未到位,enabled=false)
    -- enabled=false → 前端模型下拉里不出现;补 key 后改 enabled=true
    -- credits_per_unit 是估算:Seedance 2.0 Fast 火山官方 ¥1.5/秒 → 150 积分/秒
    ('Seedance 2.0 Fast',      'volcengine', 'video', 'seedance-2-0-fast',
        TRUE,  150, FALSE, 0, 1),

    -- Mock fallback,EASYROUTER_MODE=mock 或某 model 显式 provider=mock 时用
    ('Mock Image',             'mock',       'image', 'mock-image-1024',
        FALSE, 30,  TRUE,  9, 99),
    ('Mock Video',             'mock',       'video', 'mock-video-1024',
        FALSE, 100, TRUE,  9, 99);

-- 后续企业版接入示例(注释,供下个 migration 参考):
--   ('Seedream 4.5',     'volcengine', 'image', 'seedream-4-5',     ...),
--   ('Qwen-Image',       'bailian',    'image', 'qwen-image',       ...),
--   ('Wan 2.1 Plus',     'siliconflow','video', 'wan-2.1-plus',     ...),
