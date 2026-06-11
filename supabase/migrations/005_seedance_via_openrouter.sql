-- =============================================================================
-- 005_seedance_via_openrouter.sql
--
-- 背景:Day 5.5(2026-05-18 下午)纠错:
--   - Day 3 我错误地认定 OpenRouter 没有视频生成模型
--   - 嘉斌截图证明:OpenRouter 有 Seedance / Wan / Kling / Veo / Sora 等 13 个视频模型
--   - 根因:OpenRouter `/api/v1/models` 默认只返回 text/image 模型,
--     必须加 `?output_modalities=video` 才能列视频模型
--   - 此外正确的 Seedance 模型 ID 是 `bytedance/seedance-2.0-fast`(带点),
--     不是 `bytedance/seedance-2-0-fast`(横线)
--
-- 本 migration:
--   - 把 004 中 Seedance 行从 volcengine provider 改成 openrouter
--   - easyrouter_model_key 从 `seedance-2-0-fast` 改为 `bytedance/seedance-2.0-fast`
--   - enabled=TRUE(因为已能调通)
--   - credits_per_unit 改为按秒成本:OpenRouter Seedance Fast pricing video_tokens=0.0000056 USD/token
--     5 秒 720p 视频实测 cost=$0.6048 USD ≈ ¥4.35 ≈ 435 积分/段 ≈ 87 积分/秒
--     (产品跟踪决策 6:1 积分 = ¥0.01)
-- =============================================================================

UPDATE models
SET
    provider = 'openrouter',
    easyrouter_model_key = 'bytedance/seedance-2.0-fast',
    enabled = TRUE,
    credits_per_unit = 87  -- 每秒 87 积分(5s ≈ 435 积分;10s ≈ 870 积分)
WHERE name = 'Seedance 2.0 Fast' AND type = 'video';

-- volcengine provider 仍保留(lib/easyrouter/providers/volcengine.ts 骨架),
-- 后续若要切回字节官方 ARK(数据不出境),只动 provider 字段和 endpoint id
