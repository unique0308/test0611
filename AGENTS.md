# Codex 工作约定(工程内副本)

> ⚠️ **完整版在 `../MVP跟踪文档/AGENTS.md`**(v1.3,Day 7 末)。每次新 session 第一件事读完整版,这里只是工程内的快速指针。

## 阅读顺序(每次新 session 5 分钟)

> ⚠️ **2026-05-28 修订**:接续点权威单页是 `产品总图.md` § 9 + § 11,放在最前面。原顺序漏了它,导致接续 session 容易错过阶段 1 M5 待聊状态。

0. **`../MVP跟踪文档/产品总图.md` § 1 定位 + § 9 阶段进度 + § 11 接续指南**(M1-M5 模块拆解状态 + 当前接续点 + 接续开场白)
1. `../MVP跟踪文档/AGENTS.md` § 0 项目位置 + 快速命令 / § 1 阅读顺序 / § 2 工作纪律
2. `../LOCAL_SECRETS.md` 第 0 章状态总览(知道哪些 key 真实 / 哪些占位)
3. `../MVP跟踪文档/产品跟踪.md` § 1 项目快照(含**新 session 接续 ABCDE 建议**)
4. `../MVP跟踪文档/技术跟踪.md` § 1 技术快照 + § 10 变更日志最近条目
5. `../MVP跟踪文档/后期补全清单.md` § 0 模块状态总览
6. `../MVP跟踪文档/设计参考.md` § 4 章(仅写前端时)
7. **`./DASHBOARD_NOTES.md` 数据看板模块决策与 AI 洞察路线图**(写 /admin /manage 时必读)
8. **`./V2_BACKEND_GAPS.md` 后端字段缺口清单**(看到 fixtures 引用时查这里确认)

## 快速命令

```bash
npm run dev          # http://localhost:3000(中国大陆需 HTTPS_PROXY=http://127.0.0.1:7890)
npm run typecheck    # tsc --noEmit
npm run db:migrate   # 跑 6 个 migration(幂等)
npm run smoke        # 21 assertions 自动测试
npm run model:smoke  # 模型 client smoke
npm run report       # 飞书日报 mock 输出
```

## 工程内边界

- `lib/{auth,storage,notifications,monitoring}/index.ts` 是业务代码**唯一**入口,绝不直接 import 具体实现
- `lib/easyrouter/index.ts` 按 `params.provider` 路由到 `providers/{openrouter,volcengine,aihubmix}.ts`,新加聚合服务只加 1 个 file + switch case
- mock 实现:`mock-login.ts` / `local.ts` / `mock.ts` / `mock-client.ts`
- 切换由环境变量 `AUTH_MODE` / `STORAGE_MODE` / `NOTIFICATION_MODE` / `MONITORING_MODE` / `EASYROUTER_MODE` 控制
- 密钥真实值在 `../LOCAL_SECRETS.md`,**绝不写进工程任何文件**

## git 状态(2026-05-18 Day 7 末)

⚠️ **项目尚未 git init**。AGENTS.md 第 10.2 节对账步骤里"看 git log"暂时跳过,只看文档变更日志。
后续 `git init` 时:`.gitignore` 已写好,`.env.local` / `uploads/` / `.next/` / `.npm-cache/` 都已忽略。

## 收工纪律(必做)

每次 session 收工执行 `../MVP跟踪文档/AGENTS.md` 第 7.3 节 5 步流程。
