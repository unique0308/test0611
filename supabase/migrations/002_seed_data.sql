-- =============================================================================
-- AI 中台 MVP · seed 数据
-- 设计依据:
--   - ../MVP跟踪文档/产品跟踪.md 决策 11(mock 模式 4 部门 6 员工)
--   - ../MVP跟踪文档/设计参考.md 4.0 节(/auth/dev 的 6 个 mock 用户)
--   - ../MVP跟踪文档/产品跟踪.md 决策 4(6 预设标签 + 默认"未分类")
--   - ../MVP跟踪文档/产品跟踪.md 3.3 节(候选模型清单)
--   - ../MVP跟踪文档/产品跟踪.md 决策 5(部门月配额 5000 积分)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4 个部门
-- -----------------------------------------------------------------------------
INSERT INTO departments (name) VALUES
    ('品牌创意部'),
    ('产品研发部'),
    ('电商运营部'),
    ('市场部');

-- -----------------------------------------------------------------------------
-- 6 个员工(mock seed)
-- 邮箱占位:实际 admin 邮箱通过 ADMIN_EMAILS 环境变量判定
-- ⚠️ 嘉斌的真实邮箱:启动时填入 .env.local 的 ADMIN_EMAILS,并把这里的占位 email 替换为真实邮箱
--    (否则 mock 模式下 admin 判定会失败)
-- -----------------------------------------------------------------------------
INSERT INTO users (email, name, department_id) VALUES
    ('jiabin@example.com',     '嘉斌', (SELECT id FROM departments WHERE name = '产品研发部')),
    ('zhangsan@example.com',   '张三', (SELECT id FROM departments WHERE name = '品牌创意部')),
    ('lisi@example.com',       '李四', (SELECT id FROM departments WHERE name = '产品研发部')),
    ('wangwu@example.com',     '王五', (SELECT id FROM departments WHERE name = '电商运营部')),
    ('zhaoliu@example.com',    '赵六', (SELECT id FROM departments WHERE name = '市场部')),
    ('qianqi@example.com',     '钱七', (SELECT id FROM departments WHERE name = '品牌创意部'));

-- -----------------------------------------------------------------------------
-- 7 个 purpose_tags(6 预设 + 1 默认"未分类")
-- -----------------------------------------------------------------------------
INSERT INTO purpose_tags (name, name_normalized, is_default, sort_order) VALUES
    ('未分类',     'unclassified',     TRUE,  0),
    ('营销物料',   'marketing',        FALSE, 1),
    ('产品设计',   'product_design',   FALSE, 2),
    ('短视频内容', 'short_video',      FALSE, 3),
    ('内部素材',   'internal',         FALSE, 4),
    ('客户演示',   'customer_demo',    FALSE, 5),
    ('其他',       'other',            FALSE, 6);

-- -----------------------------------------------------------------------------
-- 候选模型(P0 必接 + P1 视进度)
-- 决策 6:Seedream 4.5 作图片基准模型,Seedance 2.0 Fast 作视频基准
-- credits_per_unit 占位估算,Day 3 实测 easyrouter 真实 cost 后修订
--   - Seedream 4.5 ≈ ¥0.30/张  → 30 积分/张
--   - Qwen-Image  ≈ ¥0.20/张  → 20 积分/张
--   - Nano banana ≈ ¥0.40/张  → 40 积分/张
--   - Seedance Fast ≈ ¥1.00/5s → 100 积分/秒
--   - 可灵 3.0 ≈ ¥1.50/5s     → 150 积分/秒
-- -----------------------------------------------------------------------------
INSERT INTO models (name, provider, type, easyrouter_model_key, is_baseline, credits_per_unit, priority, sort_order) VALUES
    ('Seedream 4.5',     '字节',   'image', 'seedream-4-5',     TRUE,  30,  0, 1),
    ('Qwen-Image',       '阿里',   'image', 'qwen-image',       FALSE, 20,  0, 2),
    ('Nano banana',      'Google', 'image', 'nano-banana',      FALSE, 40,  1, 3),
    ('Seedance 2.0 Fast', '字节',  'video', 'seedance-2-0-fast', TRUE,  100, 0, 1),
    ('可灵 3.0',         '快手',   'video', 'kling-3-0',        FALSE, 150, 1, 2);

-- -----------------------------------------------------------------------------
-- 当月配额(每个部门 5000 积分)
-- date_trunc('month', now()) 取当月 1 号
-- -----------------------------------------------------------------------------
INSERT INTO quotas (department_id, month, credits_limit)
SELECT id, date_trunc('month', CURRENT_DATE)::DATE, 5000
FROM departments;
