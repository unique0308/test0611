-- =============================================================================
-- 012_v1_model_metadata.sql · V1.11 模型分类展示
--
-- 设计依据:
--   - ../MVP跟踪文档/产品跟踪.md §3.2 V1.11
--   - 设计参考 §3.15(抽屉)+ 选模型抽屉规范(对标 Liblib + PDF 截图)
--
-- 新字段:
--   - models.preview_url TEXT — 模型预览图(可选,V1 留空也 OK,前端 fallback 渐变占位)
--   - models.description TEXT — 模型简短说明
--
-- seed update:既有 4 个模型(Gemini / Seedance / 2 mock)填 description;
-- preview_url V1 暂留空(后期加上 baseline 风格图);切真实 OSS 后填实际 URL
-- =============================================================================

ALTER TABLE models
    ADD COLUMN preview_url TEXT,
    ADD COLUMN description TEXT;

UPDATE models SET description = '谷歌 Gemini 多模态图像模型;擅长贴合 prompt 描述、支持参考图(图生图);单张 11s 出图,推荐用于营销物料 / 产品概念图。'
    WHERE name = 'Gemini 2.5 Flash Image';

UPDATE models SET description = '字节 Seedance 视频生成模型(Fast 档);5-10 秒短视频出片快 30-40s;推荐用于产品演示动效 / 短视频素材。'
    WHERE name = 'Seedance 2.0 Fast';

UPDATE models SET description = 'Mock 占位模型(SVG)— 开发测试用,生成 1024×1024 SVG 占位图,不烧 cost。'
    WHERE name = 'Mock Image';

UPDATE models SET description = 'Mock 占位视频模型(SVG)— 开发测试用,不烧 cost。'
    WHERE name = 'Mock Video';
