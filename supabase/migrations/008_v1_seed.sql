-- =============================================================================
-- 008_v1_seed.sql · V1 报销工具预设 seed
--
-- 设计依据:
--   - ../MVP跟踪文档/产品跟踪.md §3.2 V1.2(预设工具下拉:Cursor / Tripo /
--     Runway / ElevenLabs / Midjourney / Suno / 其他)
--   - ../MVP跟踪文档/技术跟踪.md §7 Week 4 任务 4.1 末段
--
-- 后续 admin UI 维护见暂存区 L2(V1 末 / V2 加)。
-- =============================================================================

INSERT INTO reimbursement_tool_presets (name, category, sort_order) VALUES
    ('Cursor',       '代码工具', 1),
    ('Tripo',        '3D',       2),
    ('Runway',       '视频',     3),
    ('ElevenLabs',   '音频',     4),
    ('Midjourney',   '图像',     5),
    ('Suno',         '音频',     6),
    ('其他',         '其他',     99);
