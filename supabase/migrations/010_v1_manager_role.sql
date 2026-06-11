-- =============================================================================
-- 010_v1_manager_role.sql · V1.5 部门负责人角色
--
-- 设计依据:
--   - ../MVP跟踪文档/产品跟踪.md §3.2 V1.5(部门负责人新角色)
--   - ../MVP跟踪文档/技术跟踪.md §3.1 V1 表清单 + §3.2 (4) managed_department_ids 设计
--   - Q-V1-07 答(2026-05-19):admin + manager 都给,默认 admin
--   - Q-V1-12 答(2026-05-19):V1 单部门,schema 用 array 留 V2 多对多扩展
--
-- 新增 users 字段:
--   - is_dept_manager BOOLEAN:从飞书组织架构同步(mock 阶段 seed 写死)
--   - managed_department_ids UUID[]:管辖的 department id 列表
--     ⚠️ departments.id 是 UUID 不是 INT,产品跟踪文档 V1.5 描述误写 int[],
--        本 migration 以 schema 真相为准
--
-- 关键决策:
--   - V1 业务代码只用 managed_department_ids[0](单部门),array 是为 V2 多对多预留
--   - 加 GIN 索引让 "WHERE x = ANY(managed_department_ids)" 走索引
-- =============================================================================

ALTER TABLE users
    ADD COLUMN is_dept_manager BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN managed_department_ids UUID[] NOT NULL DEFAULT '{}';

-- GIN 索引:支持 manager 路由权限校验时 ANY() / @> 操作走索引
-- V2 manager 数量上来时性能更稳;V1 数据量小不必担心,留扩展
CREATE INDEX idx_users_managed_depts
    ON users USING GIN (managed_department_ids)
    WHERE is_dept_manager = TRUE;

-- ─── seed 数据更新(mock 阶段)──────────────────────────────────────────────
-- 4 部门 / 4 manager:
--   张三 → 品牌创意部
--   李四 → 产品研发部
--   王五 → 电商运营部
--   赵六 → 市场部
-- (嘉斌是 admin,V1 不重叠 manager;Q-V1-07 已答 admin+manager 共存仍可,
--  这里 mock 让 manager 角色清晰可测,嘉斌走 admin 路径)
UPDATE users SET
    is_dept_manager = TRUE,
    managed_department_ids = ARRAY[(SELECT id FROM departments WHERE name = '品牌创意部')]
WHERE email = 'zhangsan@example.com';

UPDATE users SET
    is_dept_manager = TRUE,
    managed_department_ids = ARRAY[(SELECT id FROM departments WHERE name = '产品研发部')]
WHERE email = 'lisi@example.com';

UPDATE users SET
    is_dept_manager = TRUE,
    managed_department_ids = ARRAY[(SELECT id FROM departments WHERE name = '电商运营部')]
WHERE email = 'wangwu@example.com';

UPDATE users SET
    is_dept_manager = TRUE,
    managed_department_ids = ARRAY[(SELECT id FROM departments WHERE name = '市场部')]
WHERE email = 'zhaoliu@example.com';
