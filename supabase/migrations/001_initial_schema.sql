-- =============================================================================
-- AI 中台 MVP · 初始 schema
-- 设计依据:../MVP跟踪文档/技术跟踪.md 第 3 章
-- 8 张表:departments / users / purpose_tags / models / quotas
--          / generation_tasks / generation_results / audit_logs
-- 关键决策:
--   - 决策 7:角色只有员工 / admin,is_admin 由 ADMIN_EMAILS 环境变量判定,不存表
--   - 决策 3.2:generation_tasks 存 model_name / purpose_tag_name / department_id 快照
--   - 技术 3.2:audit_logs 用 BIGSERIAL(append-only 高频写)
--   - 技术 3.2:purpose_tags 用部分唯一索引(支持 V2 合并)
-- =============================================================================

-- Supabase 默认已开启 pgcrypto,gen_random_uuid() 可用
-- 不开启 RLS:MVP 期间所有访问走后端 service_role + 应用层鉴权

-- -----------------------------------------------------------------------------
-- 1. departments
-- -----------------------------------------------------------------------------
CREATE TABLE departments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT NOT NULL,
    feishu_department_id  TEXT,
    parent_department_id  UUID REFERENCES departments(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT departments_name_unique UNIQUE (name)
);

CREATE INDEX idx_departments_feishu_id ON departments(feishu_department_id)
    WHERE feishu_department_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. users
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    department_id   UUID REFERENCES departments(id),
    feishu_user_id  TEXT,  -- mock 用户为 NULL,真实接入时填
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);

CREATE INDEX idx_users_department_id ON users(department_id);
CREATE INDEX idx_users_feishu_id ON users(feishu_user_id)
    WHERE feishu_user_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. purpose_tags(6 预设 + 默认"未分类")
-- 决策 4:不允许自定义新增;V2 开放新增 + 合并能力
-- 技术 3.2:用部分唯一索引,支持 V2 合并后的同名标签重建
-- -----------------------------------------------------------------------------
CREATE TABLE purpose_tags (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT NOT NULL,
    name_normalized   TEXT NOT NULL,   -- lower + trim 后用于唯一性判断
    is_default        BOOLEAN NOT NULL DEFAULT FALSE,  -- "未分类" 为 TRUE
    merged_into_id    UUID REFERENCES purpose_tags(id),
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_active_tag
    ON purpose_tags(name_normalized)
    WHERE merged_into_id IS NULL;

-- -----------------------------------------------------------------------------
-- 4. models(模型注册表)
-- 决策 6:对外用积分,1 积分 = ¥0.01,管理员看 ¥
-- credits_per_unit:图片每张积分;视频每秒积分(乘以时长)
-- -----------------------------------------------------------------------------
CREATE TABLE models (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   TEXT NOT NULL,                      -- 显示用,如 "Seedream 4.5"
    provider               TEXT NOT NULL,                      -- 字节 / 阿里 / 快手 等
    type                   TEXT NOT NULL CHECK (type IN ('image', 'video')),
    easyrouter_model_key   TEXT NOT NULL,                      -- easyrouter 调用时的 model 字段
    is_baseline            BOOLEAN NOT NULL DEFAULT FALSE,     -- 是否作为"约等于次数"基准
    credits_per_unit       INTEGER NOT NULL,                   -- 每张图 / 每秒视频 的积分
    enabled                BOOLEAN NOT NULL DEFAULT TRUE,
    priority               INTEGER NOT NULL DEFAULT 1,         -- 0=P0必接 1=P1 视进度
    sort_order             INTEGER NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_models_easyrouter_key ON models(easyrouter_model_key);
CREATE INDEX idx_models_type_enabled ON models(type, enabled);

-- -----------------------------------------------------------------------------
-- 5. quotas(部门月配额)
-- 决策 5:只做部门月配额,默认 5000 积分(≈¥50),软提示不阻止
-- -----------------------------------------------------------------------------
CREATE TABLE quotas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    month           DATE NOT NULL,                  -- 当月 1 号
    credits_limit   INTEGER NOT NULL DEFAULT 5000,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT quotas_dept_month_unique UNIQUE (department_id, month)
);

CREATE INDEX idx_quotas_month ON quotas(month);

-- -----------------------------------------------------------------------------
-- 6. generation_tasks
-- 决策 3.2(技术):存 model_name / purpose_tag_name / department_id 快照
-- 技术 5.2:status 包含 'cancelled' 支持取消按钮
-- -----------------------------------------------------------------------------
CREATE TABLE generation_tasks (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id),
    department_id         UUID,                                -- 快照,不引用(部门改名/合并不影响历史)
    department_name       TEXT,                                -- 快照
    type                  TEXT NOT NULL CHECK (type IN ('image', 'video')),
    model_id              UUID REFERENCES models(id),
    model_name            TEXT NOT NULL,                       -- 快照
    prompt                TEXT NOT NULL,
    ratio                 TEXT NOT NULL CHECK (ratio IN ('1:1','3:4','4:3','9:16','16:9')),
    duration_seconds      INTEGER,                             -- 视频专用 5 / 10
    purpose_tag_id        UUID REFERENCES purpose_tags(id),
    purpose_tag_name      TEXT NOT NULL,                       -- 快照,默认"未分类"
    reference_image_url   TEXT,                                -- 图生图(Week 2 末 buffer)
    status                TEXT NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
    easyrouter_task_id    TEXT,
    cost_cny              NUMERIC(10, 4),                      -- 真实金额(管理员看)
    credits_cost          INTEGER,                             -- cost_cny * 100,对外显示
    error_message         TEXT,
    last_polled_at        TIMESTAMPTZ,                         -- 后端被动查询节流用
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at          TIMESTAMPTZ
);

-- Day 15 索引会按 EXPLAIN ANALYZE 结果调整,先建最常用的
CREATE INDEX idx_tasks_user_created ON generation_tasks(user_id, created_at DESC);
CREATE INDEX idx_tasks_dept_created ON generation_tasks(department_id, created_at DESC);
CREATE INDEX idx_tasks_type_created ON generation_tasks(type, created_at DESC);
CREATE INDEX idx_tasks_running ON generation_tasks(status)
    WHERE status IN ('queued', 'running');
CREATE INDEX idx_tasks_status_created ON generation_tasks(status, created_at DESC);

-- -----------------------------------------------------------------------------
-- 7. generation_results(结果文件元数据)
-- -----------------------------------------------------------------------------
CREATE TABLE generation_results (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id           UUID NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
    file_path         TEXT NOT NULL,                  -- /generations/{user_id}/{task_id}/result.{ext}
    file_type         TEXT NOT NULL,                  -- mime type
    file_size         BIGINT,
    width             INTEGER,
    height            INTEGER,
    duration_seconds  INTEGER,                        -- 视频
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_results_task_id ON generation_results(task_id);

-- -----------------------------------------------------------------------------
-- 8. audit_logs
-- 技术 3.2:BIGSERIAL 自增 ID(append-only 高频写性能)
-- 技术 5.5:login / generate_start / generate_complete / task_cancel
--           / admin_view_dashboard / admin_query_user_data / quota_adjust
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id           BIGSERIAL PRIMARY KEY,
    user_id      UUID REFERENCES users(id),
    action       TEXT NOT NULL,
    target_type  TEXT,
    target_id    TEXT,
    metadata     JSONB,
    ip_address   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action_created ON audit_logs(action, created_at DESC);

-- -----------------------------------------------------------------------------
-- updated_at 自动维护触发器(避免每次 update 都手动写)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quotas_updated_at BEFORE UPDATE ON quotas
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON generation_tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
