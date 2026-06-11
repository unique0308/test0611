# Tier 1 自测报告

> 范围: `自测清单.md` Tier 1
> 执行时间: 2026-06-02
> 环境: localhost:3000, AUTH_MODE=mock, EASYROUTER_MODE=mock

## 结果总览

| 编号 | 测试项 | 状态 | 备注 |
|---|---|---|---|
| 1.1 | 资产硬删 | 通过 | API + DB 核对通过;浏览器确认批量删除弹窗文案 |
| 1.2 | 主标签必选 blocking | 基本通过 | API + DB 核对通过;warn 色/hover tooltip 属视觉细节,待人工复核 |
| 1.3 | 生成主链路 | 部分失败 | 文生图/2图/4图/图生图/错误上传/取消通过;3图与视频播放存在问题 |

## Bug 记录

```text
#01 | 生成页/多图数量 | 按清单测试 3 张出图 | 期望: 2/3/4 均可生成 | 实际: API 返回 400, message=output_count 必须是 1/2/4;前端代码也只提供 1/2/4 | 截图链接: 无(API/代码证据) | 能稳定复现? 是 | 严重度: 数据错/需求不一致
```

```text
#02 | 生成页/图生图 | 上传 PNG data URL 后生成 | 期望: 任务结果能带回参考图信息,刷新 feed 可展示参考图 | 实际: DB generation_tasks.reference_image_url 已保存,但 /api/tasks/{id} 轮询响应 reference_image_url=null/缺失 | 截图链接: 无(API/DB 证据) | 能稳定复现? 是 | 严重度: 显示丑/状态缺失
```

```text
#03 | 生成页/文生视频 | mock 模式生成 5s/10s 视频 | 期望: 返回 video/* 文件,页面视频能播 | 实际: mock-client 明确返回 SVG 占位,file_type=image/svg+xml;无法按视频播放验证 | 截图链接: 无(API/代码证据) | 能稳定复现? 是 | 严重度: 显示丑/测试范围冲突
```

## 执行记录

### 2026-06-02 Tier 1 自动化/API/DB

- 使用普通员工 `zhangsan@example.com` 作为主测试身份,避免管理员权限影响删除隔离测试。
- 使用 `tests/selftest/tier1-runner.mjs` 调用真实 localhost API,通过 `auth_mock_user_id` cookie 模拟登录。
- 使用 Postgres 直接查询核对任务、产物、收藏、用量、会话主标签。
- 使用可见浏览器打开 `/auth/dev`、选择张三、进入 `/assets`,确认批量删除弹窗文案。

#### 1.2 主标签必选 blocking

| 子项 | 结果 | 证据 |
|---|---|---|
| 新会话未选主标签生成被拦 | 通过 | POST `/api/generate/image` 返回 400, code=`primary_tag_missing` |
| 选择主标签后可生成 | 通过 | 生成 succeeded task |
| 单次用途覆盖不改变会话主标签 | 通过 | task purpose 为覆盖值,conversation primary 仍为原主标签 |
| 主标签选“其他”长备注截断 | 通过 | `audit_logs.metadata.other_note` 长度为 20 |
| “其他”备注留空提交 | 通过 | 生成 succeeded task |
| warn 色 + hover tooltip | 待人工复核 | 视觉/hover 行为未用脚本判定 |

#### 1.3 生成主链路

| 子项 | 结果 | 证据 |
|---|---|---|
| 文生图 | 通过 | succeeded, outputs=1 |
| 多图 2 张 | 通过 | succeeded, outputs=2 |
| 多图 3 张 | 失败 | API 400: `output_count 必须是 1/2/4`;前端也只渲染 1/2/4 |
| 多图 4 张 | 通过 | succeeded, outputs=4 |
| 图生图 PNG | 基本通过 | 任务 succeeded, DB 保存 `/references/...png`;但轮询 API 未带回 reference_image_url,见 #02 |
| 文生视频 5s | 失败/范围冲突 | API succeeded,但 file_type=`image/svg+xml`,不是 video |
| 文生视频 10s | 失败/范围冲突 | API succeeded,但 file_type=`image/svg+xml`,不是 video |
| 非图片上传 | 通过 | API 400 友好报错 |
| 取消生成 | 通过 | DELETE `/api/tasks/{id}` 返回 status=`cancelled` |

#### 1.1 资产硬删

| 子项 | 结果 | 证据 |
|---|---|---|
| 删除单个任务后任务消失 | 通过 | `generation_tasks` 无该 task |
| `/profile` 本月已用跟随减少 | 通过 | DB 月度 used `590 -> 620 -> 590`,删除任务 cost=30 |
| 批量删除多个任务 | 通过 | API deleted=2,DB remaining=0 |
| 批量删除弹窗文案 | 通过 | 浏览器弹窗显示“删除将连同任务的全部产物一并移除,不可恢复。” |
| 删除收藏过的任务 | 通过 | `prompt_collections` `1 -> 0`, `generation_results` `0` |
| 切到别的员工看不到/删不到 | 通过 | 李四列表不可见张三任务,删除尝试 deleted=0,原任务仍存在 |

### 当前未卡死状态

- `generation_tasks` 中 `queued/running` 数量为 0。
