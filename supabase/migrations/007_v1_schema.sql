-- =============================================================================
-- 007_v1_schema.sql · V1 完整形态:Prompt 收藏 + 工具报销基础 schema
--
-- 设计依据:
--   - ../MVP跟踪文档/技术跟踪.md §7 Week 4 任务 4.1
--   - ../MVP跟踪文档/产品跟踪.md §3.2 V1.1 / V1.2 / V1.3 / V1.4
--   - ../MVP跟踪文档/产品跟踪.md 决策 14 D1+D2+D6(报销 3 状态 / 5 payment_type / 无草稿)
--
-- 新增 3 张表:
--   - prompt_collections           (V1.1 个人 Prompt 收藏)
--   - reimbursement_tool_presets   (V1.2 报销工具下拉预设)
--   - reimbursement_requests       (V1.2/V1.3/V1.4 报销申请单)
--
-- 关键决策:
--   - 决策 3.2 (技术):全部存快照,避免任务删除 / 模型下线导致历史失效
--   - 决策 14 D2:报销 status 3 枚举 pending/approved/rejected,不含 draft/paid
--   - 决策 14 D2:payment_type 5 枚举 monthly/annual/api_topup/one_time/plugin
--   - Q-V1-03 答:amount_cny 单笔上限 ¥2000 由应用层 zod 校验,不放 DB CHECK
--     (V2 提额时不动 schema)
--   - request_number 用 sequence + BEFORE INSERT trigger 自动填,避免应用层并发冲突
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. prompt_collections(V1.1)
-- -----------------------------------------------------------------------------
-- 字段全部快照存储:任务被清理 / 模型下线 / 标签合并都不丢历史
-- task_id 保留 FK 但可空:用作"溯源"链接,FK 不主动 ON DELETE,任务真要删时
-- 应用层应先 SET NULL(MVP 未实现任务删除,V1 仍不实现,留扩展)
CREATE TABLE prompt_collections (
    id                    BIGSERIAL PRIMARY KEY,
    user_id               UUID NOT NULL REFERENCES users(id),
    task_id               UUID REFERENCES generation_tasks(id),
    prompt_text           TEXT NOT NULL,
    model_name            TEXT NOT NULL,
    kind                  TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    ratio_or_duration     TEXT,
    reference_image_url   TEXT,
    purpose_tag_name      TEXT,
    title                 TEXT NOT NULL,
    tags                  TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompts_user_created
    ON prompt_collections(user_id, created_at DESC);

-- 唯一约束:同一用户对同一 task 只能收藏 1 次(POST 幂等保障)
CREATE UNIQUE INDEX uniq_prompt_user_task
    ON prompt_collections(user_id, task_id)
    WHERE task_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. reimbursement_tool_presets(V1.2)
-- -----------------------------------------------------------------------------
-- 报销申请表单的"工具下拉"数据源;seed 见 008_v1_seed.sql
-- enabled=FALSE 用于软下架(V1 末/V2 可加 admin UI 管理,见暂存区 L2)
CREATE TABLE reimbursement_tool_presets (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    category     TEXT,
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. reimbursement_requests(V1.2 / V1.3 / V1.4)
-- -----------------------------------------------------------------------------
-- 主表;字段对齐设计参考 §4.2.4 表单 + §4.3 admin 审核 panel
-- - department_id 存快照:员工换部门后老报销仍归原部门统计
-- - tool_name 存名字而非 FK:预设软下架后老申请仍可读
-- - attachment_urls JSONB 数组存 lib/storage 返回的 "storage://..." 引用
--   (mock 阶段是 storage://local/...,切 OSS 后是 storage://oss/...,业务代码无感)
-- - request_number 由 sequence + trigger 自动填(R-0001 zero-padded)
CREATE SEQUENCE reimbursement_request_number_seq START 1;

CREATE TABLE reimbursement_requests (
    id                     BIGSERIAL PRIMARY KEY,
    request_number         TEXT NOT NULL UNIQUE,
    user_id                UUID NOT NULL REFERENCES users(id),
    department_id          UUID NOT NULL REFERENCES departments(id),
    tool_name              TEXT NOT NULL,
    amount_cny             NUMERIC(10, 2) NOT NULL CHECK (amount_cny > 0),
    usage_period_start     DATE NOT NULL,
    usage_period_end       DATE NOT NULL,
    purpose_description    TEXT NOT NULL,
    attachment_urls        JSONB NOT NULL DEFAULT '[]'::jsonb,
    payment_type           TEXT NOT NULL CHECK (payment_type IN (
        'monthly', 'annual', 'api_topup', 'one_time', 'plugin'
    )),
    status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'rejected'
    )),
    reviewer_id            UUID REFERENCES users(id),
    review_comment         TEXT,
    reviewed_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reimb_period_valid CHECK (usage_period_end >= usage_period_start)
);

CREATE INDEX idx_reimburse_status_created
    ON reimbursement_requests(status, created_at DESC);

CREATE INDEX idx_reimburse_user_created
    ON reimbursement_requests(user_id, created_at DESC);

CREATE INDEX idx_reimburse_dept_created
    ON reimbursement_requests(department_id, created_at DESC);

-- BEFORE INSERT trigger:request_number 自动填 R-{4 位 zero-padded 序号}
-- 用 sequence 而非 MAX(id)+1 避免并发冲突;格式跟 PDF 截图 / 设计参考 §4.2.4 对齐
CREATE OR REPLACE FUNCTION assign_reimbursement_request_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.request_number IS NULL OR NEW.request_number = '' THEN
        NEW.request_number := 'R-' || LPAD(
            nextval('reimbursement_request_number_seq')::TEXT, 4, '0'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_reimbursement_request_number
    BEFORE INSERT ON reimbursement_requests
    FOR EACH ROW
    EXECUTE FUNCTION assign_reimbursement_request_number();
