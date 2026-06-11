# Tier 2 自测报告

> 范围: `自测清单.md` Tier 2
> 执行时间: 2026-06-02
> 环境: localhost:3000, AUTH_MODE=mock, EASYROUTER_MODE=mock

## 结果总览

| 编号 | 测试项 | 状态 | 备注 |
|---|---|---|---|
| 2.1 | 会话化跨态 | 部分失败 | 刷新/跨页面/空会话/默认锁定/置顶/删会话保收藏通过;重命名未截断且保留换行 |
| 2.2 | 收藏 output 级 | 通过 | API + DB 核对 output_index 粒度通过;可见浏览器确认“我的收藏”筛选入口可点击 |

## Bug 记录

```text
#04 | 会话/重命名 | 将会话名改成 emoji + 超长 + 换行字符串 | 期望: 名字不崩、截断正常(约 18 字)、换行不破坏展示 | 实际: API 接受并保存完整 52 字符串,且保留换行 | 截图链接: 无(API/DB 证据) | 能稳定复现? 是 | 严重度: 显示丑
```

## 执行记录

### 2026-06-02 Tier 2 自动化/API/DB

- 使用普通员工 `zhangsan@example.com` 作为测试身份。
- 使用 `tests/selftest/tier2-runner.mjs` 调用真实 localhost API,通过 `auth_mock_user_id` cookie 模拟登录。
- 使用 Postgres 直接查询核对会话、任务、收藏、`output_index`、软删状态。
- 使用可见浏览器打开 `/auth/dev`、切换张三、查看会话列表和 `/assets` 的“我的收藏”筛选入口。

#### 2.1 会话化跨态

| 子项 | 结果 | 证据 |
|---|---|---|
| 生成几条后刷新 feed 还在 | 通过 | DB 中该 conversation 下有 2 条 succeeded task |
| 同一会话两个标签页/页面可读取 | 通过 | `/api/conversations` 可列出该有任务会话 |
| 创建新对话进入空会话 | 通过 | 新 conversation `name=''`, taskCount=0 |
| 会话重命名 emoji/超长/换行 | 失败 | 保存完整 `😀Tier2超长会话名称带换行\nabcdefghijklmnopqrstuvwxyz1234567890`, 长度 52 |
| 默认创作不可删/改名/置顶 | 通过 | PATCH name=403, PATCH pinned=403, DELETE=403;浏览器也看不到默认创作“更多操作” |
| 置顶排序 | 通过 | 有任务会话置顶后,列表 top=`Tier2 pin B`, second=`Tier2 pin A` |
| 删除会话后收藏不应跟着死 | 通过 | DELETE conversation=200, conversation soft deleted, task + collection 仍存在 |

#### 2.2 收藏 output 级

| 子项 | 结果 | 证据 |
|---|---|---|
| 4 图任务点第 3 张星标 | 通过 | `prompt_collections` 只有一行,`output_index=2` |
| 资产页“我的收藏”筛选只标记第 3 张 | 通过 | `/api/tasks?collected=true` 返回该 task;outputs 中仅 `output_index=2` 有 `collection_id` |
| 取消收藏状态正确 | 通过 | 删除收藏后 `/api/tasks?collected=true` 不再返回该 task |
| 列表视图首张 output 0 与画廊状态一致 | 通过 | 收藏 output 0 后,普通 `/api/tasks` 中 output 0 的 `collection_id` 等于收藏 id |

### 当前未卡死状态

- `generation_tasks` 中 `queued/running` 数量为 0。
