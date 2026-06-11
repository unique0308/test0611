# V2 视觉迁移 · 后端 API 缺口清单

> 本文档列出 V2 设计要求的 UI 字段中，**ai-platform 后端目前没有**但前端用 fixtures 占位渲染的部分。
> 每个缺口含：使用位置 / fixture 文件 / 建议后端补法。

## 1. 个人中心 `/profile`

### 1.1 累计统计（lifetime stats）— ⭐⭐ 建议补
- **使用位置**：`components/profile/ProfileView.tsx` Hero 右侧统计三连（累计图片/累计视频/累计积分）
- **当前**：从 `getProfileHeaderStats().total_succeeded_count`（仅总数）+ `PROFILE_FIXTURE.lifetime` 估算图/视频比例与积分总额
- **建议补**：在 `getProfileHeaderStats` 返回新增：
  ```ts
  total_image_count: number;
  total_video_count: number;
  total_credits_cost: number;
  ```

### 1.2 本月图片/视频成本拆分（cost split by type）— ⭐⭐
- **使用位置**：「本月图片」「本月视频」卡的"消耗 X 积分 · 均 Y/张"
- **当前**：用 `image_count × imgPtsPerCount` 估算（PROFILE_FIXTURE.imgPtsPerCount=12，vidPtsPerCount=80）
- **建议补**：`UsageDashboardData` 返回新增：
  ```ts
  image_credits_cost: number;
  video_credits_cost: number;
  ```

### 1.3 用途分布积分（purpose breakdown pts）— ⭐
- **使用位置**：「用途分布」水平条上"X 积分 · Y%"
- **当前**：`purposes[].count` × imgPtsPerCount 估算
- **建议补**：`UsageDashboardData.purposes` 每项加 `credits_cost: number`

### 1.4 模型 Top 积分（models top pts）— ⭐
- **使用位置**：「常用模型」表第三列
- **当前**：展示 `models[].count`（次数），未展示积分
- **建议补**：`UsageDashboardData.models` 每项加 `credits_cost: number`

---

## 2. 数据看板 `/admin`

### 2.1 14 日趋势按图/视频拆分 — ⭐⭐⭐ 高频展示
- **使用位置**：Credit context 顶部双线趋势图（图片/视频）
- **当前**：用 `MultiTrend`（按部门拆色）求和成日总，再用 `deptCross` 的图/视频积分比例硬性拆出双线（不精确）
- **建议补**：新接口或扩展 `getDailyTrendByDept` 返回按 `type` 拆分：
  ```ts
  type DailyByType = Array<{ key: string; image_credits: number; video_credits: number }>;
  ```

### 2.2 报销支出 stat-quad — ⭐⭐
- **使用位置**：Spend context 4 宫格（单据总数 / 平均单据 / 报销人数 / 人均支出）
- **当前**：`SPEND_QUAD_FIXTURE` 全部硬编码
- **建议补**：`getReimbursementStats` 返回新增：
  ```ts
  reimburser_count: number;
  avg_amount_cny: number;
  per_capita_cny: number;
  ```
  （`total_count` 已有）

### 2.3 工具 Top 列表（by 报销金额）— ⭐⭐
- **使用位置**：Spend context "工具 Top · 按报销金额" 表（8 行：工具名/分类/使用人数/占比/金额）
- **当前**：`TOOL_TOP_FIXTURE` 硬编码 8 个工具
- **建议补**：`ReimbursementStats.by_tool` 已存在但字段少，需补：
  ```ts
  by_tool: Array<{
    tool_name: string;
    category: string; // 工具分类（"设计工具" / "AI 助手" 等）
    user_count: number;
    total_cny: number;
    share_pct: number;
  }>;
  ```

### 2.4 部门支出表 — ⭐⭐
- **使用位置**：Spend context "部门支出" 表
- **当前**：`DEPT_SPEND_FIXTURE` 硬编码 6 部门
- **建议补**：`ReimbursementStats.by_dept` 已存在，但目前不带 `member_count` 和 `share_pct`，建议补：
  ```ts
  by_dept: Array<{
    department_name: string;
    member_count: number;
    total_cny: number;
    share_pct: number;
  }>;
  ```

### 2.5 近 6 月趋势柱图 — ⭐
- **使用位置**：Spend context "近 6 月趋势" BarChart
- **当前**：`MONTH_BARS_FIXTURE` 硬编码 6 个月
- **建议补**：`ReimbursementStats.by_month` 已存在，可直接用。**当前未接入，只是 fixture 替换没接通**。

### 2.6 报销支出类型堆叠 — ⭐
- **使用位置**：Spend hero 卡内的"设计工具 38% / AI 助手 28% / 代码工具 22% / 视频工具 12%"
- **当前**：`SPEND_STACK_TYPES_FIXTURE` 硬编码
- **建议补**：由 `by_tool[].category` 聚合得到，或单独：
  ```ts
  spend_by_category: Array<{ category: string; share_pct: number; total_cny: number }>;
  ```

---

## 3. 管理面板 `/manage`

无新增缺口。**内部 3 个 panel（ReimbursementReviewPanel / QuotaPanel / PurposeTagsPanel）已对接真实 API，本次只换了外层 V2 chrome（todo-bar / V2 Tabs）**。

⚠️ **TODO**（视觉对齐 V2 但非数据缺口）：
1. ReimbursementReviewPanel 行展开 / 驳回 modal 视觉与 V2 不一致
2. QuotaPanel 行内编辑（input + delta 提示 + 保存）视觉与 V2 不一致
3. PurposeTagsPanel 没有「合并向导」分步交互、没有「建议合并」chips

这些是前端工作量，不需要后端改动。

---

## 4. 部门看板 `/manager/dashboard`

无新增缺口。V2 视觉外壳已套上，既有 ManagerQuotaCard / DeptMemberTable / ModuleDistribution 继续用真实数据。

---

## 5. 创作 `/`

无新增缺口。**所有现有 API 契约保留**：
- `POST /api/generate/{image,video}`
- `GET /api/tasks/{id}`（视频轮询）
- `POST /api/purpose-tags`（自建 tag）
- `?prefill=...` 参数加载

⚠️ **TODO**（V2 暂未实现，可后续补）：
1. Dock maximize 模态（V2 设计无，本次也未实现）— 议题 3，⭐ 可推 V2
2. 资产抽屉（V2 用独立 /assets 路由代替）
3. ~~收藏 star（V2 实现是本地 state，未对接 `/api/collections`）~~ **已对接主链路**（GenerateCore + ResultFeedItem + StarButton 联通 prompt_collections，2026-06-01 D18 闭环）。**剩余工程修复**（见 `MVP跟踪文档/产品总图.md § 8 D18` DM18.1）：
   - 3a. `components/generate/AssetPanel.tsx:43-52` feed→HistoryRow 时 collection_id 写死 null → 会话资产抽屉看不到 ⭐（待修）
   - 3b. `collectionMap` 当前 key 是 `Record<task_id, collection_id>`（`app/(main)/page.tsx:103-107` 强制取 output_index=0）→ 多图 task 收藏第 N 张时其他张状态错位（待升级 key 为 `${task_id}:${output_index}`，ResultFeedItem 按 output 渲染独立 ⭐）
   - 3c. 收藏复用 prefill 链路：`/profile` `/history` 收藏列表加"再用一次" → POST `/api/conversations` 新建会话（DM17.6 命名）+ router.push `/?conversation_id={new}&prefill=...`（D18 DM18.3 + D19 DM19.3 P1）
4. 取消 pending 任务按钮（V2 无该 UI）— 议题 2，⭐⭐ 灰测启动前定

---

## 优先级建议

| 优先级 | 缺口 | 影响 |
|---|---|---|
| ⭐⭐⭐ | 2.1 14 日趋势按 type 拆分 | admin 主面板核心图表 |
| ⭐⭐ | 1.1 lifetime stats | profile hero 三连 |
| ⭐⭐ | 1.2 cost split by type | profile 中间三卡 |
| ⭐⭐ | 2.2 spend stat-quad | admin spend 子面板 |
| ⭐⭐ | 2.3 by_tool 扩展 | admin spend 主表 |
| ⭐⭐ | 2.4 by_dept 扩展 | admin spend 副表 |
| ⭐ | 1.3 purpose pts | profile 用途水平条 |
| ⭐ | 1.4 model pts | profile 常用模型表 |
| ⭐ | 2.5 接入 by_month | admin spend 近 6 月 |
| ⭐ | 2.6 spend by category | admin spend hero 堆叠 |

**最小可用 patch**：补足 ⭐⭐⭐ + 4 项 ⭐⭐，前端只需替换 fixture import 为真实字段读取（保留 fixture 文件作 fallback）。

---

## Fixtures 文件清单

- `lib/fixtures/profile.ts` — Profile 缺口
- `lib/fixtures/admin.ts` — Admin 缺口

所有 fixture 文件顶部都有 `TODO（后端缺口）` 注释指向本文档。
