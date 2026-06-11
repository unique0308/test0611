# AI 中台 MVP

公司内部 AI 图像/视频生成统一入口。3 周 MVP 验证 4 个产品假设。

## 文档体系

所有产品 / 技术 / 设计 / 切换路线图文档都在工程**外部**的 `../MVP跟踪文档/` 下:

- `产品跟踪.md` — What/When/Who,主力滚动文档
- `技术跟踪.md` — How/Why/Watch-out
- `后期补全清单.md` — mock vs 真实模块状态 + 切换路线图
- `设计参考.md` — 视觉规范 + 原型映射
- `CLAUDE.md` — Claude Code 工作约定(每次新 session 必读)

密钥与本地配置存档在工程外的 `../LOCAL_SECRETS.md`(单独存放避免误传 git)。

## 启动

```bash
pnpm install
cp .env.local.example .env.local
# 按 LOCAL_SECRETS.md 填入 Supabase / easyrouter 等真实值
pnpm dev
```

打开 http://localhost:3000

**mock 模式下登录**:访问 http://localhost:3000/auth/dev 切换 6 个 mock 身份。

## 当前阶段

Week 1 Day 1(2026-05-21 起跑),mock + 抽象层模式。详见 `../MVP跟踪文档/产品跟踪.md` 第 1 章。

## 关键铁律

1. 业务代码只 `import from '@/lib/auth'`,不直接 import mock/real 实现
2. 不做 `产品跟踪.md` 第 3.2 节砍掉清单里的功能
3. mock→真实切换由嘉斌触发,Claude Code 不自决
4. `/auth/dev` 生产环境必须 `notFound()`
