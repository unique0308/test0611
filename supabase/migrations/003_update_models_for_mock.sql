-- =============================================================================
-- 003_update_models_for_mock.sql
--
-- 背景:Day 3(2026-05-18)实测发现:
--   - 原 PRD 中的 easyrouter 实际换成 aihubmix
--   - aihubmix 上 OpenAI 兼容 /v1/images/generations 端点唯一可用模型 gpt-image-2
--     在嘉斌个人号下 4 次调用 3 次 hung,稳定性不达 H4 标准
--   - 没有任何视频生成模型
--   - 切到 EASYROUTER_MODE=mock(临时推翻决策 11),等嘉斌补稳定 API key
--
-- 本 migration:
--   - 清空 002 灌入的 5 个国产模型(easyrouter_model_key 全部对不上 aihubmix)
--   - 灌入 2 个 mock 占位模型(image / video 各 1),足够 Day 4-5 走通主线
--   - 真实接入时新增 migration 推翻这次
--
-- 跟产品跟踪 3.3 节"候选模型清单"对应,3.3 节同步标注"实测后修订"
-- =============================================================================

-- 删除 002 的 model 数据。generation_tasks.model_id 外键 references,在 002 后还没产生
-- 真实任务数据,直接删安全。如果真发生过生成,会因外键约束失败,需要 cascade 处理
DELETE FROM models;

INSERT INTO models (name, provider, type, easyrouter_model_key, is_baseline, credits_per_unit, priority, sort_order) VALUES
    ('Mock Image',  'mock', 'image', 'mock-image-1024', TRUE,  30,  0, 1),
    ('Mock Video',  'mock', 'video', 'mock-video-1024', TRUE,  100, 0, 1);

-- 注:嘉斌补稳定 image/video API key 后,新增 migration 增补真实模型:
--   - 如继续用 aihubmix:gpt-image-2 / gemini-3-pro-image-preview(需 Gemini 原生 schema)
--   - 如切火山方舟:Seedream / Seedance 等(回到原 PRD 假设)
--   - 如切硅基流动:多家国产模型可选
