-- =============================================================================
-- 014_v1_easyrouter_provider.sql
--
-- 背景:Day 38(2026-05-19)嘉斌补 easyrouter.io 测试 key
--   - base URL https://easyrouter.io/v1,OpenAI 兼容协议
--   - 定位:测试用,后续买企业服务后更换
--   - lib/easyrouter/providers/easyrouter.ts 已实现(图片走 chat completions
--     + Markdown data URL 解析;视频走 /v1/videos 异步轮询)
--
-- 本 migration:
--   - 加 2 个 easyrouter provider 的模型,跟 OpenRouter 同模型并存
--   - 用户在 ModelPickerDrawer(V1.11)里能看到两个 provider 的同名模型,各选其一
--
--   1. Gemini 2.5 Flash Image (easyrouter) — image,easyrouter_model_key 同 OpenRouter
--   2. Dreamina Seedance 2.0 Fast (easyrouter) — video,字节 Seedance 系
--
-- credits_per_unit 估算(easyrouter usage 不返回 cost USD,只能按经验估):
--   - 图片 30 积分/张(略高于 OpenRouter 实测的 28,留余地)
--   - 视频 120 积分/秒(介于 OpenRouter Seedance 87 与 火山官价 150 之间)
--   实际成本走平台对账,前端展示用此估算
--
-- 显示顺序:baseline=FALSE,priority=1 → 在同类型里排在 OpenRouter 之后
-- =============================================================================

INSERT INTO models
    (name, provider, type, easyrouter_model_key, is_baseline, credits_per_unit, enabled, priority, sort_order, description) VALUES
    ('Gemini 2.5 Flash Image (easyrouter)', 'easyrouter', 'image', 'gemini-2.5-flash-image',
        FALSE, 30, TRUE, 1, 2,
        '通过 easyrouter.io 聚合调用 Gemini 2.5 Flash Image,测试通道'),
    ('Dreamina Seedance 2.0 Fast (easyrouter)', 'easyrouter', 'video', 'dreamina-seedance-2-0-fast',
        FALSE, 120, TRUE, 1, 2,
        '字节即梦 Seedance 2.0 Fast 视频生成,5s/10s 两档,通过 easyrouter.io 调用');
