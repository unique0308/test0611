# M5 H2 验证指标 · Baseline 重算 SQL + 埋点字段清单

> 本文档是 DM5.5 落地细化 — 给 Session A P2 H2 埋点 + 聚合 SQL 实施用
> 决策来源：`产品总图.md § 8 D16` DM5.5 + DM5.9 + **2026-06-01 Session B 探讨闭环**
> 引用：`V1灰测版PRD.md § 2.1` M5 P2 H2 行 / `产品跟踪.md § 5 H2` 5 主指标定义

---

## § 0 文档定位

DM5.5 已在 `产品总图.md § 8 D16`（2026-05-29）拍 5 主指标 + 达标线初值。本文档解决"指标怎么算出来"这层 —— 5 个分桶口子拍板 + schema 加 1 字段 + audit_log 新 4 action + 聚合 SQL 骨架 + Week 1 baseline 重算流程。

**不在本文档范围**：① H1 平台绕过率（数据源在 Liblib 报销额 + 系统生成数对比，跟 M5 标签无关，详见 `产品跟踪.md § 5 H1`）。下面只覆盖 ②③④⑤ + 2 辅助。

---

## § 1 5 主指标分桶公式（5 个口子拍板 · 2026-06-01 Session B 闭环）

| 口子 | 拍板 | Why |
|---|---|---|
| **口子 1 · 分母粒度** | ② "其他"占比走**真 conv 级**：分子 = 主标签 = "其他"的 conv 数 / 分母 = 有主标签的非默认创作 conv 数 | DM5.8 的语义就是"一个会话 = 一件事"，主标签代表会话的业务场景。task 级混入会用"单次覆盖"稀释，反而失真 |
| **口子 2 · 默认创作处理** | 默认创作主标签选择 = 真实选择行为，**进 ②③ 分母**；但 audit_log 标记 `is_default_conv_first_select = TRUE`，Week 1 复盘**分桶对比**默认创作 vs 非默认 conv 的 ② 差异 | migration 024 line 20-22 显式说"既有 conv 全部留 NULL，包括默认创作，首次进入都要选主标签"—— 跟新建 conv 同样是真实选择。但首次"被强制弹"心理状态跟"主动选"不同，分桶看防止数据失真 |
| **口子 3 · 收藏复用新 conv** | DM18.3 每次复用 = 新建 conv + 1 次主标签选择，**正常计入 ②③ 分母**；audit_log 标记 `from_collection_reuse = TRUE`，Week 1 复盘**不预设阈值**，看真实分布决定是否分桶算 | DM18.3 设计就是"每次复用 = 起新坑 = 主标签独立选择"，剔除会让 conv 化语义不自洽。但留个分桶口子防数据失真。阈值不预设（[[feedback_no-arbitrary-thresholds]]） |
| **口子 4 · 改主标签算改标吗** | **算**。④ 分子 = 单次覆盖次数 + 改主标签次数；audit_log **分开记两种 action**，Week 1 复盘可拆开看哪种主导 | 都体现"员工主动质疑默认值"信号 — ④ 的本意。分开记保留追溯能力 |
| **口子 5 · 改主标签后 ② 按哪个时刻算** | **按当前值**：SQL 直接 `WHERE c.primary_purpose_tag_id = '其他'`；改主标签是低频行为（DM17.7 心智重），audit_log 保留改动历史用于追溯 | 最简单 schema 不动 + 改主标签心智重不会乱改 + ④ 已捕捉改主标签行为形成数据闭环 |

---

## § 2 Schema 加字段（1 个 migration）

### 2.1 新增字段

| 表 | 字段 | 类型 | 默认值 | 服务于 |
|---|---|---|---|---|
| `generation_tasks` | `is_single_override` | `BOOLEAN NOT NULL` | `FALSE` | ④ 主动改标率分子高效查询 |

**为什么不能用 SQL 派生**：派生算法（`task.purpose_tag_id ≠ conv.primary_purpose_tag_id`）会被改主标签污染 —— 历史 task 改主标签后会被误判为"单次覆盖"。`is_single_override` 在 task 生成那一刻定（根据当时 conv 主标签判断），写完不再变，跟决策 3.2 快照哲学一致（model_name / purpose_tag_name / department_id 都是快照字段）。

### 2.2 已立项不在本文档（M5 P2 其他任务已覆盖）

- `purpose_tags.created_by_user_id` —— `V1灰测版PRD.md § 2.1` line 124 M5 P2 任务"自定义标签 schema 加 description（≥10 字 minLength）+ user_id cap 2"已立项
- admin 待发现场景专区 UI —— `V1灰测版PRD.md § 2.1` line 125 已立项

### 2.3 migration 建议命名

`supabase/migrations/025_v1_m5_h2_tracking.sql`（沿用 023/024 命名风格）

```sql
-- =====================================================================
-- 025 · M5 P2 · H2 5 主指标 baseline 重算埋点
-- =====================================================================
-- DM5.5 落地细化（2026-06-01 Session B 闭环 / M5_H2_BASELINE_SQL.md § 2）
-- 加 is_single_override 字段:
--   task 生成那一刻定（request.purpose_tag_id ≠ conv.primary_purpose_tag_id 即 TRUE）
--   决策 3.2 快照哲学:写完不再变,避免改主标签污染历史聚合
-- =====================================================================

BEGIN;

ALTER TABLE generation_tasks
    ADD COLUMN IF NOT EXISTS is_single_override BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN generation_tasks.is_single_override IS
    'M5 H2 ④ 主动改标率分子源:task 生成时 request.purpose_tag_id ≠ conv.primary_purpose_tag_id 即 TRUE。决策 3.2 快照哲学,写完不变。';

-- ④ 主动改标率聚合常用筛选,加索引
CREATE INDEX IF NOT EXISTS idx_tasks_single_override_created
    ON generation_tasks (is_single_override, created_at DESC)
    WHERE is_single_override = TRUE;

COMMIT;
```

---

## § 3 audit_log 新增 action（无 schema 变更）

`audit_logs.action` 在 DB 层是 text 不是 enum，新增不需要 migration；只需 `lib/types/v1.ts` 的 `V1AuditAction` 枚举加新值。

| action | metadata 字段 | 服务于 | 复用既有？ |
|---|---|---|---|
| `conversation_primary_tag_set` | `conv_id` / `tag_id` / `is_default_conv_first_select`（口子 2）/ `from_collection_reuse`（口子 3） | ② 分桶 | **新增** |
| `conversation_primary_tag_change` | `conv_id` / `old_tag_id` / `new_tag_id` | ④ 分子（改主标签部分） | **新增** |
| `generation_purpose_tag_override` | `task_id` / `override_tag_id` / `conv_primary_tag_id` | ④ 分子（单次覆盖追溯） | **新增** |
| `generation_purpose_other_text` | `task_id` / `text`（短文本 ≤20 字） | ② 语义补充 | **新增** |
| `purpose_tag_create` | `tag_id` / `description_length` / `is_custom=true` | ③ 自定义创建率 / ⑤ 价值锚 | **复用既有**（V1AuditAction 已存在，metadata 加 `is_custom=true`） |

**命名风格对齐**（V1AuditAction 现有模式 `<模块>_<动作>` / `<模块>_<动作>_<对象>`）：
- conversation 模块：`conversation_primary_tag_*`
- generation 模块：`generation_purpose_*`
- purpose_tag 模块：复用既有 `purpose_tag_create`，metadata `is_custom=true` 区分

---

## § 4 写入触发时机（哪些 API 路径加 audit）

| API 路径 | action 触发 | 备注 |
|---|---|---|
| `POST /api/conversations` | （首次创建时不写 primary_tag_set，因为 primary_purpose_tag_id = NULL，待选） | 用户首次进 conv 选主标签时才触发 |
| `PATCH /api/conversations/[id]/primary-tag`（或既有 PATCH） | `conversation_primary_tag_set`（NULL → tag_id 首次）/ `conversation_primary_tag_change`（tag_id → tag_id 改值） | 区分首次设 vs 后续改 |
| `POST /api/generate/{image,video}` | 生成 task 时后端判 `is_single_override`：`request.purpose_tag_id !== conv.primary_purpose_tag_id` 即 TRUE，写 `generation_purpose_tag_override` audit；"其他"短文本 input 触发 `generation_purpose_other_text` | task 已写入主表 is_single_override 字段 + audit 留痕 |
| `POST /api/purpose-tags`（自定义标签创建） | `purpose_tag_create`（复用既有），metadata 加 `is_custom=true` + `description_length` | 跟现有 purpose_tag_create 行为合并 |

---

## § 5 5 主指标聚合 SQL 骨架（含分桶）

> 所有 SQL 都假设 `:window_start` / `:window_end` 是参数化时间窗口（Week 1 复盘 / Week 2 中评 / Week 4 末终评）。

### § 5.1 ② "其他"占比

```sql
-- 总 ②（baseline 用这个）
WITH active_conv AS (
  SELECT c.id, c.user_id, c.is_default, c.primary_purpose_tag_id, c.created_at,
         pt.name_normalized AS primary_tag_norm,
         -- 口子 3 标记：该 conv 是否由收藏复用驱动创建
         EXISTS (
           SELECT 1 FROM audit_logs al
           WHERE al.action = 'conversation_primary_tag_set'
             AND al.metadata->>'conv_id' = c.id::text
             AND (al.metadata->>'from_collection_reuse')::boolean = TRUE
         ) AS is_from_reuse
  FROM conversations c
  JOIN purpose_tags pt ON pt.id = c.primary_purpose_tag_id
  WHERE c.deleted_at IS NULL
    AND c.primary_purpose_tag_id IS NOT NULL
    AND c.created_at >= :window_start AND c.created_at < :window_end
)
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE primary_tag_norm = 'other_v2')
              / NULLIF(COUNT(*), 0), 2) AS other_pct,
  COUNT(*) AS total_active_conv
FROM active_conv;

-- 分桶 A：默认创作 vs 非默认（口子 2 必看）
SELECT is_default,
       ROUND(100.0 * COUNT(*) FILTER (WHERE primary_tag_norm = 'other_v2')
                   / NULLIF(COUNT(*), 0), 2) AS other_pct,
       COUNT(*) AS conv_count
FROM active_conv GROUP BY is_default;

-- 分桶 B：收藏复用驱动 vs 非复用（口子 3）
SELECT is_from_reuse,
       ROUND(100.0 * COUNT(*) FILTER (WHERE primary_tag_norm = 'other_v2')
                   / NULLIF(COUNT(*), 0), 2) AS other_pct,
       COUNT(*) AS conv_count
FROM active_conv WHERE is_default = FALSE GROUP BY is_from_reuse;
```

### § 5.2 ③ 自定义创建率（人均）

```sql
-- 依赖：purpose_tags.created_by_user_id（M5 P2 line 124 已立项加）

WITH active_users AS (
  SELECT DISTINCT user_id FROM generation_tasks
  WHERE created_at >= :window_start AND created_at < :window_end
),
user_custom_count AS (
  SELECT created_by_user_id AS user_id, COUNT(*) AS n
  FROM purpose_tags
  WHERE is_user_created = TRUE AND merged_into_id IS NULL
    AND created_at >= :window_start AND created_at < :window_end
  GROUP BY created_by_user_id
)
SELECT AVG(COALESCE(ucc.n, 0)) AS per_capita_custom_tag,
       COUNT(au.user_id) AS active_user_count
FROM active_users au LEFT JOIN user_custom_count ucc ON ucc.user_id = au.user_id;
```

### § 5.3 ④ 主动改标率

```sql
WITH window_tasks AS (
  SELECT id, user_id, is_single_override, created_at
  FROM generation_tasks
  WHERE created_at >= :window_start AND created_at < :window_end
    AND status = 'succeeded'
),
primary_changes AS (
  SELECT COUNT(*) AS n FROM audit_logs
  WHERE action = 'conversation_primary_tag_change'
    AND created_at >= :window_start AND created_at < :window_end
)
SELECT
  SUM(CASE WHEN is_single_override THEN 1 ELSE 0 END) AS single_override_n,
  (SELECT n FROM primary_changes) AS primary_change_n,
  COUNT(*) AS total_task,
  ROUND(100.0 * (SUM(CASE WHEN is_single_override THEN 1 ELSE 0 END)
                  + (SELECT n FROM primary_changes))
              / NULLIF(COUNT(*), 0), 2) AS active_change_rate_pct
FROM window_tasks;

-- 拆开看：单次覆盖 vs 改主标签 分别占比（Week 1 复盘看哪种主导）
SELECT
  'single_override' AS kind,
  ROUND(100.0 * SUM(CASE WHEN is_single_override THEN 1 ELSE 0 END)
              / NULLIF(COUNT(*), 0), 2) AS rate_pct
FROM window_tasks
UNION ALL
SELECT
  'primary_change' AS kind,
  ROUND(100.0 * (SELECT n FROM primary_changes) / NULLIF((SELECT COUNT(*) FROM window_tasks), 0), 2)
  AS rate_pct;
```

### § 5.4 ⑤ 业务模块聚类潜力

```sql
WITH custom_usage AS (
  SELECT pt.id, pt.name,
    COUNT(DISTINCT gt.user_id) AS user_n,
    COUNT(DISTINCT gt.department_id) AS dept_n,
    COUNT(gt.id) AS task_n
  FROM purpose_tags pt
  JOIN generation_tasks gt ON gt.purpose_tag_id = pt.id
  WHERE pt.is_user_created = TRUE AND pt.merged_into_id IS NULL
    AND gt.created_at >= :window_start AND gt.created_at < :window_end
  GROUP BY pt.id, pt.name
)
SELECT
  COUNT(*) FILTER (WHERE user_n >= 3 AND dept_n >= 2) AS clear_candidate_n,
  COUNT(*) FILTER (WHERE user_n >= 2 AND dept_n >= 1) AS weak_candidate_n,
  COUNT(*) AS all_custom_tag_n
FROM custom_usage;
```

### § 5.5 辅助指标

**辅助 1 · 偷懒探测**（任一标签占某员工总生成 > 70%）：

```sql
SELECT user_id, primary_tag_name, this_tag_count, user_total, ratio_pct
FROM (
  SELECT
    gt.user_id,
    gt.purpose_tag_name AS primary_tag_name,
    COUNT(*) AS this_tag_count,
    SUM(COUNT(*)) OVER (PARTITION BY gt.user_id) AS user_total,
    100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY gt.user_id) AS ratio_pct
  FROM generation_tasks gt
  WHERE gt.created_at >= :window_start AND gt.created_at < :window_end
  GROUP BY gt.user_id, gt.purpose_tag_name
) sub
WHERE ratio_pct > 70;
```

**辅助 2 · 投诉率**：不入 SQL，PM 收集飞书反馈 + A1 访谈记录里 "≥3 人主动抱怨"。

---

## § 6 Week 1 baseline 重算流程（不预设阈值 · [[feedback_no-arbitrary-thresholds]]）

1. Week 1 末跑 § 5 全部 SQL（含分桶）
2. PM/admin 看真实分布数据，对照 DM5.5 初值表（②≤40% / ③≥0.3 / ④≥5% / ⑤≥2 候选）
3. 拍 baseline 调整：
   - 某指标分桶后差异显著（如默认创作"其他"占比远高于非默认）→ 拆指标分开看
   - 初值偏离真实分布过大 → 调初值（按真实分布百分位重置，**不硬调阈值**）
4. 调完写进 `产品跟踪.md § 5 H2` + `V1灰测版PRD.md § 3.2` 第二版 baseline
5. 同步给 `产品总图.md § 8 D16` 补充节加 Week 1 复盘结论行

---

## § 7 Session A 实施清单

### 7.1 必做（M5 P2 H2 埋点 + 聚合 SQL）

- [ ] 新建 migration `supabase/migrations/025_v1_m5_h2_tracking.sql`（见 § 2.3）
- [ ] `lib/types/v1.ts` V1AuditAction 加 4 个新 action（见 § 3）
- [ ] `PATCH /api/conversations/[id]` 或新增 `PATCH /api/conversations/[id]/primary-tag` 加 audit 写入逻辑（首次 set / 后续 change 区分）
- [ ] `POST /api/generate/{image,video}` 加 `is_single_override` 计算（写主表）+ `generation_purpose_tag_override` audit 写入；"其他"短文本 input 触发 `generation_purpose_other_text` audit
- [ ] `POST /api/purpose-tags` audit metadata 加 `is_custom=true` + `description_length`（复用 `purpose_tag_create` action）
- [ ] `lib/db/queries.ts` 加 5 主指标聚合 SQL 函数（命名：`getH2OtherPctByWindow` / `getH2CustomTagRateByWindow` / `getH2ActiveChangeRateByWindow` / `getH2ClusterPotentialByWindow` / `getH2LazyDetection`）
- [ ] `/admin/insights` 加"H2 5 主指标 baseline"卡（Week 1 复盘消费端，admin 一眼能看到当前 baseline 跟初值的差距）

### 7.2 不在本文档范围（已在 V1 PRD § 2.1 立项）

- `purpose_tags.created_by_user_id` 字段 → M5 P2 line 124
- admin 待发现场景专区 UI → M5 P2 line 125

### 7.3 实施顺序建议

1. 先 migration 025（无前置依赖）
2. 同时改 V1AuditAction（独立改 ts 文件）
3. 改 PATCH /api/conversations 路径（依赖 V1AuditAction 新值）
4. 改 POST /api/generate（依赖 V1AuditAction 新值 + is_single_override 字段）
5. 改 POST /api/purpose-tags audit metadata（依赖 V1AuditAction 既有 + 新 metadata 字段）
6. 加 lib/db/queries.ts 5 个聚合函数（依赖前几步全做完）
7. 改 /admin/insights 加 H2 baseline 卡（依赖 queries.ts）

---

## § 8 文档变更日志

| 日期 | 版本 | 变更 | 作者 |
|---|---|---|---|
| 2026-06-01 | v0.1 起 | Session B 探讨闭环 — DM5.5 落地细化（5 个口子拍板 / schema 加 1 字段 / audit_log 加 4 新 action + 复用 1 既有 / 聚合 SQL 骨架 / Week 1 baseline 流程） | 嘉斌 + CC |

---

## § 9 接续指南

新 session 进来想接 H2 5 主指标实施，按这个顺序读：

1. **本文档** § 1 5 个口子拍板 + § 7 Session A 实施清单 → 知道做什么
2. **`产品总图.md § 8 D16`** DM5.5 + DM5.9 → 知道 5 主指标 + 达标线初值的来源
3. **`产品总图.md § 8 D17 / D18 / D19`** → 知道为什么本文档分桶逻辑长这样（conv 化 + 收藏复用 + output 级耦合）
4. **`V1灰测版PRD.md § 2.1`** M5 P2 行 + **`产品跟踪.md § 5 H2`** → 知道指标在更大 PRD 体系里的位置

执行前问 PM：① 本文档拍板有没有需要 push back 的；② 实施顺序按 § 7.3 还是有别的优先级；③ /admin/insights 卡是这次顺便做还是单独议题。
